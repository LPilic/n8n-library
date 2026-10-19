const express = require('express');
const compression = require('compression');
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

// Compress dynamic responses (node icons are ~2MB of JSON). Leave SSE alone:
// compression buffers data and would break real-time delivery.
app.use(compression({
  filter: (req, res) => {
    if (res.getHeader('Content-Type') === 'text/event-stream') return false;
    return compression.filter(req, res);
  },
}));

// Request IDs make it possible to correlate logs with a failed request.
app.use((req, res, next) => {
  req.id = crypto.randomUUID();
  res.setHeader('X-Request-ID', req.id);
  next();
});

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

// Disable Cloudflare page modifications (Rocket Loader, email obfuscation, minification)
app.use((_req, res, next) => {
  res.setHeader('cf-edge-cache', 'no-cache');
  res.setHeader('x-robots-tag', 'noindex');
  if (_req.path.startsWith('/api/')) {
    res.setHeader('Cache-Control', 'no-store');
  }
  next();
});

// --- Session ---

const SESSION_SECRET = process.env.SESSION_SECRET;
if (!SESSION_SECRET || SESSION_SECRET === 'dev-secret-change-me' || SESSION_SECRET.length < 16) {
  const generated = crypto.randomBytes(32).toString('hex');
  console.warn('WARNING: SESSION_SECRET is missing or too short. Using random secret (sessions will not survive restarts). Set SESSION_SECRET env var to a strong value (32+ chars).');
  process.env.SESSION_SECRET = generated;
}

// --- Credential Encryption Key ---
if (!process.env.CREDENTIAL_ENCRYPTION_KEY || process.env.CREDENTIAL_ENCRYPTION_KEY.length < 64) {
  if (process.env.NODE_ENV === 'production') {
    console.error('FATAL: CREDENTIAL_ENCRYPTION_KEY is required in production (64 hex chars = 32 bytes).');
    console.error('Generate one with: openssl rand -hex 32');
    process.exit(1);
  }
  const generated = crypto.randomBytes(32).toString('hex');
  console.warn('WARNING: CREDENTIAL_ENCRYPTION_KEY is missing or too short. Generating an ephemeral key for this process. Stored credentials will be unreadable after restart. Set CREDENTIAL_ENCRYPTION_KEY (64 hex chars).');
  process.env.CREDENTIAL_ENCRYPTION_KEY = generated;
}

// Migrate legacy plaintext API keys. Never re-encrypt a value that looks like
// ciphertext: a decrypt failure means the key changed or the data is corrupt,
// and encrypting it again would make it permanently unreadable.
(async () => {
  try {
    const { encrypt, decrypt } = require('./lib/crypto');
    const dbPool = require('./db');
    const { rows } = await dbPool.query("SELECT id, api_key FROM n8n_instances WHERE api_key IS NOT NULL AND api_key != ''");
    for (const inst of rows) {
      try {
        decrypt(inst.api_key);
      } catch {
        const looksLikeCiphertext = /^[A-Za-z0-9+/]{40,}={0,2}$/.test(inst.api_key);
        if (looksLikeCiphertext) {
          console.warn(`Instance #${inst.id} API key cannot be decrypted with the current CREDENTIAL_ENCRYPTION_KEY; leaving it unchanged. Re-enter the key in Settings.`);
          continue;
        }
        const encrypted = encrypt(inst.api_key);
        await dbPool.query('UPDATE n8n_instances SET api_key = $1 WHERE id = $2', [encrypted, inst.id]);
        console.log(`Encrypted API key for instance #${inst.id}`);
      }
    }
  } catch (e) { /* skip if DB not ready */ }
})();

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

// --- API Key authentication ---

const apiKeyAuth = require('./lib/api-key-auth');
app.use(apiKeyAuth);

// --- CSRF protection ---

app.use((req, res, next) => {
  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
    if (req.apiKeyAuth) return next(); // API key auth is not susceptible to CSRF
    if (req.path.startsWith('/templates/') || req.path === '/health' || req.path.startsWith('/api/public/') || req.path === '/mcp' || req.path === '/api/hitl/requests' || req.path.startsWith('/api/hitl/capture/') || req.path.startsWith('/api/hitl/webhook/')) return next();
    const xrw = req.headers['x-requested-with'];
    if (xrw !== 'XMLHttpRequest') {
      return res.status(403).json({ error: 'Missing X-Requested-With header' });
    }
  }
  next();
});

// --- Static frontend ---

// React frontend is served separately via `npm run dev:frontend` (port 5173) during development.
// To switch production to React, set FRONTEND=react env var.
const useReactFrontend = process.env.FRONTEND === 'react';
const reactBuildPath = path.join(__dirname, 'frontend', 'dist');
if (useReactFrontend && fs.existsSync(reactBuildPath)) {
  app.use(express.static(reactBuildPath, {
    setHeaders: function(res, filePath) {
      if (filePath.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      }
    }
  }));
}

app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders: function(res, filePath) {
    if (filePath.endsWith('.html') || filePath.endsWith('.js') || filePath.endsWith('.css')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
  }
}));

// --- CORS for n8n-facing routes and API key requests ---

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (req.path.startsWith('/templates/') || req.path.startsWith('/workflows/') || req.path.startsWith('/api/public/') || req.path === '/health') {
    res.header('Access-Control-Allow-Origin', origin || '*');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Accept, n8n-version');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
  }
  // CORS for API key authenticated requests and MCP endpoint
  if ((req.path.startsWith('/api/') || req.path === '/mcp') && (req.headers['authorization'] || req.headers['x-api-key'])) {
    res.header('Access-Control-Allow-Origin', origin || '*');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Accept, Authorization, X-API-Key, Mcp-Session-Id, n8n-version');
    res.header('Access-Control-Expose-Headers', 'Mcp-Session-Id');
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

app.get('/readyz', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ready', uptime: process.uptime() });
  } catch {
    res.status(503).json({ status: 'not_ready', message: 'database unavailable' });
  }
});

// --- Mount route modules ---

const templatesRouter = require('./routes/templates');
templatesRouter.setNodeData(NODE_ICONS, NODE_CREDS);

app.use(require('./routes/dashboard'));
app.use(require('./routes/auth'));
app.use(templatesRouter);
app.use(require('./routes/tickets'));
app.use(require('./routes/kb'));
app.use(require('./routes/monitoring'));
app.use(require('./routes/settings'));
app.use(require('./routes/ai'));
app.use(require('./routes/mcp-routes'));
app.use(require('./routes/api-keys'));
app.use(require('./routes/notifications'));
app.use(require('./routes/search'));
app.use(require('./routes/audit'));
app.use(require('./routes/alerts'));
app.use(require('./routes/webhooks'));
app.use(require('./routes/hitl'));
app.use(require('./routes/prompts'));
app.use(require('./routes/variables'));
app.use(require('./routes/tags'));
app.use(require('./routes/security'));
app.use(require('./routes/credentials'));
app.use(require('./routes/credential-store'));

// --- API Documentation (Swagger) ---

const swaggerUi = require('swagger-ui-express');
let openApiSpec = {};
try {
  openApiSpec = JSON.parse(fs.readFileSync(path.join(__dirname, 'openapi.json'), 'utf8'));
} catch (e) {
  console.warn('openapi.json not found — /api/docs will show empty spec');
}
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openApiSpec, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'n8n Library API',
}));

// --- MCP Server endpoint ---

const { createMcpServer } = require('./lib/mcp-server');

(async () => {
  try {
    const { StreamableHTTPServerTransport } = await import('@modelcontextprotocol/sdk/server/streamableHttp.js');
    const transports = {};
    const mcpServers = new Map(); // session ID -> per-session server with actor context

    // MCP endpoint — requires API key auth + must be enabled
    app.all('/mcp', async (req, res) => {
      // Check if MCP server is enabled
      try {
        const { rows } = await pool.query("SELECT value FROM settings WHERE key = 'mcp_server_enabled'");
        if (rows.length && rows[0].value === 'false') {
          return res.status(503).json({ error: 'MCP server is disabled' });
        }
      } catch {}
      if (!req.user) return res.status(401).json({ error: 'API key required' });

      const sessionId = req.headers['mcp-session-id'];

      if (req.method === 'GET' || req.method === 'DELETE') {
        if (!sessionId || !transports[sessionId]) return res.status(400).json({ error: 'Invalid or missing session' });
        const transport = transports[sessionId];
        if (req.method === 'GET') return transport.handleRequest(req, res);
        // DELETE — close session
        await transport.handleRequest(req, res);
        const sessionServer = mcpServers.get(sessionId);
        if (sessionServer) {
          sessionServer.close().catch(() => {});
          mcpServers.delete(sessionId);
        }
        delete transports[sessionId];
        return;
      }

      if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

      // Check if this is an initialize request (new session)
      const body = req.body;
      const isInit = body?.method === 'initialize' || (Array.isArray(body) && body.some(m => m.method === 'initialize'));

      if (isInit) {
        try {
          // Each MCP session gets its own server instance so tool permissions
          // are tied to the authenticated actor rather than shared process-wide.
          const sessionServer = await createMcpServer(req.user);
          const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => crypto.randomUUID(),
            onsessioninitialized: (sid) => {
              transports[sid] = transport;
              mcpServers.set(sid, sessionServer);
            },
          });
          transport.onclose = () => {
            const sid = Object.keys(transports).find(k => transports[k] === transport);
            if (sid) {
              delete transports[sid];
              mcpServers.delete(sid);
            }
            sessionServer.close().catch(() => {});
          };
          await sessionServer.server.connect(transport);
          return transport.handleRequest(req, res, body);
        } catch (e) {
          console.error('MCP session initialization error:', e.message);
          return res.status(500).json({ error: 'Failed to initialize MCP session' });
        }
      }

      // Existing session
      if (!sessionId || !transports[sessionId]) return res.status(400).json({ error: 'Invalid or missing session' });
      return transports[sessionId].handleRequest(req, res, body);
    });

    console.log('MCP server endpoint available at /mcp');
  } catch (e) {
    console.warn('Failed to initialize MCP server endpoint:', e.message);
  }
})();

// --- Startup tasks ---

const { getAiConfig, scheduleDailySummaryCron } = require('./lib/ai-providers');
const { reconnectAllMcp } = require('./lib/mcp');

getAiConfig().catch(() => {});
scheduleDailySummaryCron();
reconnectAllMcp();

const { startAlertEngine } = require('./lib/alert-engine');
startAlertEngine();

// --- Client-side routing catch-all ---
// Serve index.html for panel routes so direct navigation and refresh work
const CLIENT_ROUTES = ['dashboard','library','n8n','categories','tickets','kb','monitoring','observability','ai','settings','users','audit','approvals','approvals-builder','prompts','variables','tags','security','credentials'];
app.get('*', (req, res, next) => {
  const segment = req.path.split('/')[1];
  if (CLIENT_ROUTES.includes(segment)) {
    // Serve React build only if FRONTEND=react, otherwise legacy frontend
    if (useReactFrontend) {
      const reactIndex = path.join(__dirname, 'frontend', 'dist', 'index.html');
      if (fs.existsSync(reactIndex)) {
        return res.sendFile(reactIndex);
      }
    }
    return res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
  next();
});

// --- JSON 404s and centralized error handling ---

app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Not found', requestId: req.id });
});

app.use((err, req, res, next) => {
  console.error(`Unhandled request error [${req.id}] ${req.method} ${req.originalUrl}:`, err);
  if (res.headersSent) return next(err);
  res.status(err.status || 500).json({
    error: err.status && err.status < 500 ? err.message : 'Internal server error',
    requestId: req.id,
  });
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection:', reason);
});

// --- Graceful shutdown ---

const server = app.listen(PORT, () => {
  console.log(`n8n template library running on http://localhost:${PORT}`);
});

let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} received — shutting down`);
  server.close(() => {
    pool.end().catch(() => {}).finally(() => process.exit(0));
  });
  // SSE clients can keep the HTTP server open indefinitely; close them after a
  // short grace period so the container can stop cleanly.
  const forceTimer = setTimeout(() => {
    if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
  }, 5000);
  forceTimer.unref();
  const exitTimer = setTimeout(() => process.exit(1), 15000);
  exitTimer.unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
