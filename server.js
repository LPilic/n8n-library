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
    const mcpServer = await createMcpServer();
    const { StreamableHTTPServerTransport } = await import('@modelcontextprotocol/sdk/server/streamableHttp.js');
    const transports = {};

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
        delete transports[sessionId];
        return;
      }

      if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

      // Check if this is an initialize request (new session)
      const body = req.body;
      const isInit = body?.method === 'initialize' || (Array.isArray(body) && body.some(m => m.method === 'initialize'));

      if (isInit) {
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => crypto.randomUUID(),
          onsessioninitialized: (sid) => { transports[sid] = transport; },
        });
        transport.onclose = () => {
          const sid = Object.keys(transports).find(k => transports[k] === transport);
          if (sid) delete transports[sid];
        };
        await mcpServer.server.connect(transport);
        return transport.handleRequest(req, res, body);
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
const CLIENT_ROUTES = ['dashboard','library','n8n','categories','tickets','kb','monitoring','observability','ai','settings','users','audit','approvals','approvals-builder'];
app.get('*', (req, res, next) => {
  const segment = req.path.split('/')[1];
  if (CLIENT_ROUTES.includes(segment)) {
    return res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
  next();
});

app.listen(PORT, () => {
  console.log(`n8n template library running on http://localhost:${PORT}`);
});
