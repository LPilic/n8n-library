#!/usr/bin/env node
/**
 * Adds any Express routes that are missing from openapi.json using a generic
 * operation shape. Existing hand-written operations are preserved.
 *
 * Run with: npm run openapi
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const specPath = path.join(root, 'openapi.json');
const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));

const files = [
  path.join(root, 'server.js'),
  ...fs.readdirSync(path.join(root, 'routes'))
    .filter(f => f.endsWith('.js'))
    .map(f => path.join(root, 'routes', f)),
];

function normalizePath(p) {
  return p.replace(/:([A-Za-z0-9_]+)/g, '{$1}');
}

function tagFor(p) {
  if (p.startsWith('/templates') || p.startsWith('/workflows')) return 'n8n Templates';
  if (p.startsWith('/api/auth')) return 'Auth';
  if (p.startsWith('/api/users')) return 'Users';
  if (p.startsWith('/api/api-keys')) return 'API Keys';
  if (p.startsWith('/api/templates') || p.startsWith('/api/categories') || p.startsWith('/api/node-')) return 'Templates';
  if (p.startsWith('/api/kb')) return 'Knowledge Base';
  if (p.startsWith('/api/tickets') || p.startsWith('/api/ticket')) return 'Tickets';
  if (p.startsWith('/api/monitoring') || p.startsWith('/api/instances')) return 'Monitoring';
  if (p.startsWith('/api/settings')) return 'Settings';
  if (p.startsWith('/api/ai')) return 'AI';
  if (p.startsWith('/api/mcp')) return 'MCP';
  if (p.startsWith('/api/hitl')) return 'Approvals';
  if (p.startsWith('/api/prompts')) return 'Prompts';
  if (p.startsWith('/api/credentials') || p.startsWith('/api/credential-store')) return 'Credentials';
  if (p.startsWith('/api/alerts')) return 'Alerts';
  if (p.startsWith('/api/variables')) return 'Variables';
  if (p.startsWith('/api/tags')) return 'Tags';
  if (p.startsWith('/api/audit')) return 'Audit';
  if (p.startsWith('/api/notifications')) return 'Notifications';
  if (p.startsWith('/api/search')) return 'Search';
  if (p.startsWith('/api/webhooks')) return 'Webhooks';
  if (p.startsWith('/api/security')) return 'Security';
  if (p === '/health' || p === '/readyz' || p === '/mcp') return 'System';
  return 'Other';
}

const publicPrefixes = [
  '/health',
  '/readyz',
  '/templates',
  '/workflows',
  '/api/auth/login',
  '/api/auth/logout',
  '/api/auth/forgot-password',
  '/api/auth/reset-password',
  '/api/auth/instances',
  '/api/public/',
  '/api/node-icons',
  '/api/node-creds',
  '/api/categories',
  '/api/settings/branding',
  '/api/ai/status',
];

function isPublic(p) {
  return publicPrefixes.some(prefix => p === prefix || p.startsWith(prefix));
}

const found = new Map();
const routePattern = /(?:router|app)\.(get|post|put|patch|delete|all)\(\s*'([^']+)'/g;

for (const file of files) {
  const source = fs.readFileSync(file, 'utf8');
  for (const match of source.matchAll(routePattern)) {
    const method = match[1];
    let routePath = match[2];
    if (!routePath.startsWith('/') || routePath === '*') continue;
    routePath = normalizePath(routePath);
    const methods = method === 'all' ? ['get', 'post', 'delete'] : [method];
    for (const verb of methods) {
      if (!found.has(routePath)) found.set(routePath, new Set());
      found.get(routePath).add(verb);
    }
  }
}

const tagDescriptions = {
  'n8n Templates': 'n8n-compatible template and workflow endpoints',
  Auth: 'Authentication, password reset, and 2FA',
  Users: 'User administration',
  'API Keys': 'Programmatic API key management',
  Templates: 'Template library management',
  'Knowledge Base': 'Knowledge base articles, categories, tags, and attachments',
  Tickets: 'Service desk tickets and comments',
  Monitoring: 'n8n instances, executions, workers, and metrics',
  Settings: 'SMTP, branding, AI, email templates, and import/export',
  AI: 'AI chat, workflow help, and conversations',
  MCP: 'Model Context Protocol servers and tools',
  Approvals: 'Human-in-the-loop approval templates and requests',
  Prompts: 'Prompt library and versioning',
  Credentials: 'n8n credentials and credential-store provisioning',
  Alerts: 'Scheduled alert rules',
  Variables: 'n8n variables',
  Tags: 'n8n workflow tags',
  Audit: 'Audit log',
  Notifications: 'In-app notifications',
  Search: 'Global search',
  Webhooks: 'Outbound webhook integrations',
  Security: 'n8n security audit',
  System: 'Health, readiness, and MCP transport',
  Other: 'Uncategorized endpoints',
};

spec.tags = spec.tags || [];
for (const [name, description] of Object.entries(tagDescriptions)) {
  if (!spec.tags.some(t => t.name === name)) spec.tags.push({ name, description });
}

let added = 0;
for (const [routePath, methods] of [...found.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
  if (!spec.paths[routePath]) spec.paths[routePath] = {};
  for (const method of [...methods].sort()) {
    if (spec.paths[routePath][method]) continue;
    const tag = tagFor(routePath);
    const isStream = routePath.endsWith('/stream');
    const operation = {
      tags: [tag],
      summary: `${method.toUpperCase()} ${routePath}`,
      operationId: `${method}_${routePath.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '')}`,
      responses: isStream
        ? { 200: { description: 'Server-sent event stream', content: { 'text/event-stream': { schema: { type: 'string' } } } } }
        : {
            200: { description: 'OK' },
            '4XX': { description: 'Client error' },
            '5XX': { description: 'Server error' },
          },
    };
    if (!isPublic(routePath)) {
      operation.security = [{ bearerAuth: [] }, { apiKeyHeader: [] }, { sessionAuth: [] }];
    }
    spec.paths[routePath][method] = operation;
    added++;
  }
}

fs.writeFileSync(specPath, JSON.stringify(spec, null, 2) + '\n');
console.log(`OpenAPI: ${Object.keys(spec.paths).length} paths (${added} operations added).`);
