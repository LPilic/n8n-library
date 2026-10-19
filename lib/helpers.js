const crypto = require('crypto');
const dns = require('dns').promises;
const net = require('net');
const pool = require('../db');

// HTML escape for emails
function escHtml(s) {
  if (!s) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Minimum password length
const MIN_PASSWORD_LENGTH = 8;
function validatePassword(pw) {
  if (!pw || pw.length < MIN_PASSWORD_LENGTH) return `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
  return null;
}

// Convert basic HTML to markdown for n8n template descriptions
function htmlToMarkdown(s) {
  if (!s) return '';
  let md = String(s);
  md = md.replace(/<br\s*\/?>/gi, '\n');
  md = md.replace(/<\/p>\s*<p>/gi, '\n\n');
  md = md.replace(/<\/?p>/gi, '\n');
  md = md.replace(/<strong>(.*?)<\/strong>/gi, '**$1**');
  md = md.replace(/<b>(.*?)<\/b>/gi, '**$1**');
  md = md.replace(/<em>(.*?)<\/em>/gi, '*$1*');
  md = md.replace(/<i>(.*?)<\/i>/gi, '*$1*');
  md = md.replace(/<code>(.*?)<\/code>/gi, '`$1`');
  md = md.replace(/<h[1-3][^>]*>(.*?)<\/h[1-3]>/gi, '### $1\n');
  md = md.replace(/<li>(.*?)<\/li>/gi, '- $1\n');
  md = md.replace(/<\/?[uo]l>/gi, '\n');
  md = md.replace(/<a\s+href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '[$2]($1)');
  md = md.replace(/<[^>]*>/g, '');
  md = md.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  md = md.replace(/\n{3,}/g, '\n\n').trim();
  return md;
}

function buildTemplateItem(row) {
  return {
    id: row.id,
    name: row.name,
    description: htmlToMarkdown(row.description || ''),
    totalViews: row.total_views,
    recentViews: row.recent_views,
    price: null,
    purchaseUrl: null,
    createdAt: row.created_at,
    user: {
      id: row.id,
      name: row.user_username,
      username: row.user_username,
      bio: '',
      verified: row.user_verified,
      links: '[]',
      avatar: '',
    },
    image: row.image || [],
    categories: row.categories || [],
    nodes: row.nodes || [],
    workflowInfo: row.workflow_info || {},
    workflow: row.workflow,
  };
}

function slugify(text) {
  return text.toString().toLowerCase().trim()
    .replace(/[^\w\s-]/g, '').replace(/[\s_]+/g, '-').replace(/^-+|-+$/g, '')
    .substring(0, 120);
}

async function uniqueSlug(title) {
  let slug = slugify(title);
  if (!slug) slug = 'article';
  const { rows } = await pool.query('SELECT 1 FROM kb_articles WHERE slug = $1', [slug]);
  if (rows.length) slug += '-' + crypto.randomBytes(3).toString('hex');
  return slug;
}

async function getSettingWithDefault(key, defaultVal) {
  try {
    const { rows } = await pool.query('SELECT value FROM settings WHERE key = $1', [key]);
    return rows[0]?.value || defaultVal;
  } catch (e) { return defaultVal; }
}

// SSRF protection — returns true if URL targets a private/internal address
function isPrivateUrl(urlStr) {
  try {
    const u = new URL(urlStr);
    const host = u.hostname.toLowerCase();
    // Block localhost variants
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]') return true;
    if (host.endsWith('.localhost')) return true;
    // Block cloud metadata endpoints
    if (host === '169.254.169.254' || host === 'metadata.google.internal') return true;
    // Block IPv6 shorthand for loopback/private
    if (host.startsWith('[') || host.includes(':')) return true;
    // Block 0.0.0.0
    if (host === '0.0.0.0') return true;
    // Block private IPv4 ranges
    const parts = host.split('.').map(Number);
    if (parts.length === 4 && parts.every(p => !isNaN(p) && p >= 0 && p <= 255)) {
      if (parts[0] === 10) return true;
      if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
      if (parts[0] === 192 && parts[1] === 168) return true;
      if (parts[0] === 127) return true;
      if (parts[0] === 0) return true;
      if (parts[0] === 169 && parts[1] === 254) return true;
    }
    // Block non-http(s) schemes
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return true;
    return false;
  } catch {
    return true;
  }
}

// Validate that a URL is safe for outbound AI/API requests
function validateExternalUrl(urlStr) {
  if (!urlStr) return true; // empty is fine, defaults will be used
  try {
    const u = new URL(urlStr);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    if (isPrivateUrl(urlStr)) return false;
    return true;
  } catch {
    return false;
  }
}

// Returns true for loopback, private, link-local, CGNAT, multicast, and
// reserved addresses. Used after DNS resolution as well as for literals.
function isPrivateIp(ip) {
  if (!ip || typeof ip !== 'string') return true;

  if (net.isIPv4(ip)) {
    const parts = ip.split('.').map(Number);
    if (parts.length !== 4 || parts.some(p => Number.isNaN(p) || p < 0 || p > 255)) return true;
    if (parts[0] === 0 || parts[0] === 10 || parts[0] === 127) return true;
    if (parts[0] === 169 && parts[1] === 254) return true;
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    if (parts[0] === 192 && parts[1] === 168) return true;
    if (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) return true;
    if (parts[0] >= 224) return true;
    return false;
  }

  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    if (lower === '::' || lower === '::1') return true;
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // unique local
    if (/^fe[89ab]/.test(lower)) return true; // link-local fe80::/10
    if (lower.startsWith('64:ff9b:')) return true; // NAT64
    if (lower.startsWith('2001:db8')) return true; // documentation
    if (lower.startsWith('::ffff:')) {
      const rest = lower.slice(7);
      if (net.isIPv4(rest)) return isPrivateIp(rest);
      const mapped = rest.match(/^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
      if (mapped) {
        const hi = parseInt(mapped[1], 16);
        const lo = parseInt(mapped[2], 16);
        return isPrivateIp(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
      }
    }
    return false;
  }

  return true;
}

// Async SSRF check that also resolves hostnames. This closes the gap where a
// public hostname points at a private address. It does not protect against a
// TOCTOU DNS rebind between this check and the actual request; callers that
// need that guarantee should use an allowlist or a pinned HTTP agent.
async function validateExternalUrlResolved(urlStr) {
  if (!validateExternalUrl(urlStr)) return false;
  try {
    const u = new URL(urlStr);
    if (net.isIP(u.hostname)) return !isPrivateIp(u.hostname);
    const addresses = await dns.lookup(u.hostname, { all: true, verbatim: true });
    if (!addresses.length) return false;
    return addresses.every(({ address }) => !isPrivateIp(address));
  } catch {
    return false;
  }
}

// HMAC-SHA256 signature for outbound webhook/HITL payloads.
function signPayload(secret, body) {
  return 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');
}

module.exports = {
  escHtml,
  MIN_PASSWORD_LENGTH,
  validatePassword,
  buildTemplateItem,
  slugify,
  uniqueSlug,
  getSettingWithDefault,
  isPrivateIp,
  isPrivateUrl,
  validateExternalUrl,
  validateExternalUrlResolved,
  signPayload,
};
