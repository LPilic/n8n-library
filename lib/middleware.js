const rateLimit = require('express-rate-limit');

function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'Forbidden' });
    next();
  };
}

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  message: { error: 'Too many attempts, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

const forgotLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { error: 'Too many reset requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: 'AI rate limit exceeded, try again in a minute' },
  standardHeaders: true,
  legacyHeaders: false,
});

const ticketLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { error: 'Too many requests, slow down' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Per-user rate limit for write operations (templates, KB, settings)
const writeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  keyGenerator: (req) => req.user ? `user-${req.user.id}` : 'anon',
  message: { error: 'Too many write operations, slow down' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Public API rate limit (unauthenticated template/workflow endpoints)
const publicLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Rate limit exceeded' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Strict rate limit for credential operations (10 req/min per user)
const credentialLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  keyGenerator: (req) => req.user ? `cred-${req.user.id}` : 'anon',
  message: { error: 'Credential operation rate limit exceeded, try again in a minute' },
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = {
  requireAuth,
  requireRole,
  authLimiter,
  forgotLimiter,
  aiLimiter,
  ticketLimiter,
  writeLimiter,
  publicLimiter,
  credentialLimiter,
};
