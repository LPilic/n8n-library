const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const pool = require('./db');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const helmet = require('helmet');

// --- Load node icon/credential data ---

let NODE_ICONS = {};
try {
  NODE_ICONS = JSON.parse(fs.readFileSync(path.join(__dirname, 'node-icons.json'), 'utf8'));
  console.log(`Loaded ${Object.keys(NODE_ICONS).length} node icon definitions`);
} catch (e) {
  console.warn('node-icons.json not found — node icons in templates will be generic');
}

let NODE_CREDS = {};
try {
  NODE_CREDS = JSON.parse(fs.readFileSync(path.join(__dirname, 'node-creds.json'), 'utf8'));
  console.log(`Loaded ${Object.keys(NODE_CREDS).length} node credential definitions`);
} catch (e) {
  console.warn('node-creds.json not found — setup time estimates unavailable');
}

// --- Express setup ---

const app = express();

// Trust proxy when behind nginx/load balancer
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

app.use(express.json({ limit: '10mb' }));

const PORT = process.env.PORT || 3100;

// Security headers
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: false,
  crossOriginResourcePolicy: false,
  frameguard: false,
  hsts: process.env.NODE_ENV === 'production',
}));

// --- Session ---

const SESSION_SECRET = process.env.SESSION_SECRET;
if (!SESSION_SECRET || SESSION_SECRET === 'dev-secret-change-me' || SESSION_SECRET.length < 16) {
  const generated = crypto.randomBytes(32).toString('hex');
  console.warn('WARNING: SESSION_SECRET is missing or too short. Using random secret (sessions will not survive restarts). Set SESSION_SECRET env var to a strong value (32+ chars).');
  process.env.SESSION_SECRET = generated;
}

app.use(session({
  store: new pgSession({ pool, tableName: 'session' }),
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 7 * 24 * 60 * 60 * 1000,
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
  },
}));

// --- Re-validate user role from DB on each request ---

app.use(async (req, _res, next) => {
  if (req.session.user) {
    try {
      const { rows } = await pool.query('SELECT id, username, email, role FROM users WHERE id = $1', [req.session.user.id]);
      if (rows.length === 0) {
        req.session.destroy(() => {});
        req.user = null;
      } else {
        req.user = { id: rows[0].id, username: rows[0].username, email: rows[0].email, role: rows[0].role };
        req.session.user = req.user;
      }
    } catch {
      req.user = req.session.user;
    }
  } else {
    req.user = null;
  }
  next();
});

// --- CSRF protection ---

app.use((req, res, next) => {
  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
    if (req.path.startsWith('/templates/') || req.path === '/health' || req.path.startsWith('/api/public/')) return next();
    const xrw = req.headers['x-requested-with'];
    if (xrw !== 'XMLHttpRequest') {
      return res.status(403).json({ error: 'Missing X-Requested-With header' });
    }
  }
  next();
});

// --- Static frontend ---

app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders: function(res, filePath) {
    if (filePath.endsWith('.html') || filePath.endsWith('.js') || filePath.endsWith('.css')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
  }
}));

// --- CORS for n8n-facing routes ---

app.use((req, res, next) => {
  if (req.path.startsWith('/templates/') || req.path.startsWith('/workflows/') || req.path.startsWith('/api/public/')) {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Accept');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
  }
  next();
});

// --- Request logging ---

app.use((req, _res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.originalUrl}`);
  next();
});

// --- Health check ---

app.get('/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok' });
  } catch {
    res.status(503).json({ status: 'error', message: 'database unavailable' });
  }
});

// --- Mount route modules ---

const templatesRouter = require('./routes/templates');
templatesRouter.setNodeData(NODE_ICONS, NODE_CREDS);

app.use(require('./routes/auth'));
app.use(templatesRouter);
app.use(require('./routes/tickets'));
app.use(require('./routes/kb'));
app.use(require('./routes/monitoring'));
app.use(require('./routes/settings'));
app.use(require('./routes/ai'));
app.use(require('./routes/mcp-routes'));

// --- Startup tasks ---

const { getAiConfig, scheduleDailySummaryCron } = require('./lib/ai-providers');
const { reconnectAllMcp } = require('./lib/mcp');

getAiConfig().catch(() => {});
scheduleDailySummaryCron();
reconnectAllMcp();

app.listen(PORT, () => {
  console.log(`n8n template library running on http://localhost:${PORT}`);
});
