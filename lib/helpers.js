const crypto = require('crypto');
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

module.exports = {
  escHtml,
  MIN_PASSWORD_LENGTH,
  validatePassword,
  buildTemplateItem,
  slugify,
  uniqueSlug,
  getSettingWithDefault,
  isPrivateUrl,
  validateExternalUrl,
};
