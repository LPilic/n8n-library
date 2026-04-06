const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const pool = require('../db');
const { escHtml, validatePassword } = require('../lib/helpers');
const { requireAuth, requireRole, authLimiter, forgotLimiter } = require('../lib/middleware');
const { renderEmail, getMailTransport, getSmtpFrom, APP_URL, SMTP_FROM } = require('../lib/email');
const { auditLog } = require('../lib/audit');
const { authenticator } = require('otplib');
const QRCode = require('qrcode');

const router = express.Router();

// Login
router.post('/api/auth/login', authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
    const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [email.toLowerCase().trim()]);
    if (rows.length === 0) return res.status(401).json({ error: 'Invalid credentials' });
    const user = rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    // Check if 2FA is enabled
    if (user.totp_enabled && user.totp_secret) {
      const { totp_token } = req.body;
      if (!totp_token) {
        return res.status(200).json({ requires_2fa: true, message: 'TOTP token required' });
      }
      const isValid = authenticator.check(totp_token, user.totp_secret);
      if (!isValid) return res.status(401).json({ error: 'Invalid 2FA code' });
    }

    // Regenerate session to prevent session fixation
    const userData = { id: user.id, username: user.username, email: user.email, role: user.role };
    await new Promise((resolve, reject) => {
      req.session.regenerate((err) => {
        if (err) return reject(err);
        req.session.user = userData;
        resolve();
      });
    });
    res.json({ user: userData });
  } catch (err) {
    console.error('Login error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Logout
router.post('/api/auth/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    res.json({ message: 'Logged out' });
  });
});

// Current user
router.get('/api/auth/me', (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  res.json({ user: req.user });
});

// Forgot password
router.post('/api/auth/forgot-password', forgotLimiter, async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });
    const { rows } = await pool.query('SELECT id, username, email FROM users WHERE email = $1', [email.toLowerCase().trim()]);
    if (rows.length === 0) return res.json({ message: 'If that email exists, a reset link has been sent.' });
    const user = rows[0];

    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    await pool.query(
      'INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)',
      [user.id, tokenHash, expiresAt]
    );

    const resetUrl = `${APP_URL}?reset=${token}`;
    const emailData = await renderEmail('password_reset', {
      username: escHtml(user.username),
      reset_url: resetUrl,
    });

    const mailTransport = getMailTransport();
    if (mailTransport) {
      const fromAddr = await getSmtpFrom();
      await mailTransport.sendMail({
        from: fromAddr,
        to: user.email,
        subject: emailData.subject,
        html: emailData.html,
      });
      console.log(`Password reset email sent to ${user.email}`);
    } else {
      console.log(`\n=== PASSWORD RESET (no SMTP) ===\nUser: ${user.email}\nReset URL: ${resetUrl}\nExpires: ${expiresAt.toISOString()}\n================================\n`);
    }

    res.json({ message: 'If that email exists, a reset link has been sent.' });
  } catch (err) {
    console.error('Forgot password error:', err.message);
    res.status(500).json({ error: 'Failed to process request' });
  }
});

// Reset password
router.post('/api/auth/reset-password', authLimiter, async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) return res.status(400).json({ error: 'Token and new password required' });
    const pwErr = validatePassword(password);
    if (pwErr) return res.status(400).json({ error: pwErr });

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const { rows } = await pool.query(
      `SELECT t.*, u.email FROM password_reset_tokens t JOIN users u ON u.id = t.user_id
       WHERE t.token = $1 AND t.used = FALSE AND t.expires_at > NOW()`,
      [tokenHash]
    );
    if (rows.length === 0) return res.status(400).json({ error: 'Invalid or expired reset link' });

    const resetToken = rows[0];
    const hash = await bcrypt.hash(password, 10);
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, resetToken.user_id]);
    await pool.query('UPDATE password_reset_tokens SET used = TRUE WHERE user_id = $1', [resetToken.user_id]);
    // Invalidate all existing sessions for this user
    await pool.query("DELETE FROM session WHERE (sess->'user'->>'id')::int = $1", [resetToken.user_id]).catch(() => {});

    res.json({ message: 'Password has been reset. You can now sign in.' });
  } catch (err) {
    console.error('Reset password error:', err.message);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

// --- Two-Factor Authentication (TOTP) ---

router.get('/api/auth/2fa/status', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT totp_enabled FROM users WHERE id = $1', [req.user.id]);
    res.json({ enabled: rows.length > 0 && rows[0].totp_enabled === true });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/api/auth/2fa/setup', requireAuth, async (req, res) => {
  try {
    const secret = authenticator.generateSecret();
    const { rows } = await pool.query('SELECT email FROM users WHERE id = $1', [req.user.id]);
    const email = rows[0].email;
    const otpauth = authenticator.keyuri(email, 'n8n Library', secret);
    const qrDataUrl = await QRCode.toDataURL(otpauth);

    // Store secret temporarily (not enabled yet until verified)
    await pool.query('UPDATE users SET totp_secret = $1 WHERE id = $2', [secret, req.user.id]);

    res.json({ secret, qr: qrDataUrl });
  } catch (err) {
    console.error('2FA setup error:', err.message);
    res.status(500).json({ error: 'Failed to setup 2FA' });
  }
});

router.post('/api/auth/2fa/verify', requireAuth, async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'Token required' });

    const { rows } = await pool.query('SELECT totp_secret FROM users WHERE id = $1', [req.user.id]);
    if (!rows[0].totp_secret) return res.status(400).json({ error: 'Setup 2FA first' });

    const isValid = authenticator.check(token, rows[0].totp_secret);
    if (!isValid) return res.status(400).json({ error: 'Invalid code. Try again.' });

    await pool.query('UPDATE users SET totp_enabled = TRUE WHERE id = $1', [req.user.id]);
    auditLog(req.user, 'enabled', '2fa', req.user.id);
    res.json({ message: '2FA enabled successfully' });
  } catch (err) {
    console.error('2FA verify error:', err.message);
    res.status(500).json({ error: 'Failed to verify 2FA' });
  }
});

router.post('/api/auth/2fa/disable', requireAuth, async (req, res) => {
  try {
    const { password } = req.body;
    if (!password) return res.status(400).json({ error: 'Password required to disable 2FA' });

    const { rows } = await pool.query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
    const valid = await bcrypt.compare(password, rows[0].password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid password' });

    await pool.query('UPDATE users SET totp_secret = NULL, totp_enabled = FALSE WHERE id = $1', [req.user.id]);
    auditLog(req.user, 'disabled', '2fa', req.user.id);
    res.json({ message: '2FA disabled' });
  } catch (err) {
    console.error('2FA disable error:', err.message);
    res.status(500).json({ error: 'Failed to disable 2FA' });
  }
});

// --- User management (admin only) ---

router.get('/api/users', requireRole('admin'), async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT id, username, email, role, created_at FROM users ORDER BY id');
    res.json({ users: rows });
  } catch (err) {
    console.error('Load users error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/api/users', requireRole('admin'), async (req, res) => {
  try {
    const { username, password, email, role } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
    const pwErr = validatePassword(password);
    if (pwErr) return res.status(400).json({ error: pwErr });
    if (role && !['admin', 'editor', 'viewer'].includes(role)) return res.status(400).json({ error: 'Invalid role' });
    const hash = await bcrypt.hash(password, 10);
    const { rows } = await pool.query(
      'INSERT INTO users (username, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id, username, email, role',
      [username || email.split('@')[0], email.toLowerCase().trim(), hash, role || 'viewer']
    );
    auditLog(req.user, 'created', 'user', rows[0].id, `${rows[0].username} (${rows[0].role})`);
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Email already exists' });
    console.error('Create user error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/api/users/:id', requireRole('admin'), async (req, res) => {
  try {
    const { username, password, email, role } = req.body;
    const updates = []; const params = []; let idx = 1;
    if (username !== undefined) { updates.push(`username = $${idx++}`); params.push(username); }
    if (email !== undefined) { updates.push(`email = $${idx++}`); params.push(email.toLowerCase().trim()); }
    if (role !== undefined) {
      if (!['admin', 'editor', 'viewer'].includes(role)) return res.status(400).json({ error: 'Invalid role' });
      updates.push(`role = $${idx++}`); params.push(role);
    }
    if (password) {
      const pwErr = validatePassword(password);
      if (pwErr) return res.status(400).json({ error: pwErr });
      updates.push(`password_hash = $${idx++}`); params.push(await bcrypt.hash(password, 10));
    }
    if (updates.length === 0) return res.status(400).json({ error: 'Nothing to update' });
    params.push(req.params.id);
    await pool.query(`UPDATE users SET ${updates.join(', ')} WHERE id = $${idx}`, params);
    res.json({ message: 'User updated' });
  } catch (err) {
    console.error('Update user error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/api/users/:id', requireRole('admin'), async (req, res) => {
  try {
    if (req.user.id === parseInt(req.params.id)) return res.status(400).json({ error: 'Cannot delete yourself' });
    const { rowCount } = await pool.query('DELETE FROM users WHERE id = $1', [req.params.id]);
    if (rowCount === 0) return res.status(404).json({ error: 'User not found' });
    auditLog(req.user, 'deleted', 'user', req.params.id);
    res.json({ message: 'User deleted' });
  } catch (err) {
    console.error('Delete user error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
