/**
 * n8n Library MCP Server — exposes library data as MCP tools.
 * Used both as an HTTP endpoint in the Express app and as a standalone stdio server.
 */
const pool = require('../db');

async function getDisabledTools() {
  try {
    const { rows } = await pool.query("SELECT value FROM settings WHERE key = 'mcp_disabled_tools'");
    return rows.length ? JSON.parse(rows[0].value) : [];
  } catch { return []; }
}

function guardedTool(server, name, description, schema, handler) {
  server.tool(name, description, schema, async (args) => {
    const disabled = await getDisabledTools();
    if (disabled.includes(name)) {
      return { content: [{ type: 'text', text: `Tool "${name}" is currently disabled by the administrator.` }] };
    }
    return handler(args);
  });
}

async function createMcpServer() {
  const { McpServer } = await import('@modelcontextprotocol/sdk/server/mcp.js');

  const server = new McpServer({
    name: 'n8n-library',
    version: '1.0.0',
  });

  // --- Templates ---

  guardedTool(server,'search_templates', 'Search workflow templates by keyword, category, or list all', {
    query: { type: 'string', description: 'Search query (optional)' },
    category: { type: 'string', description: 'Category name filter (optional)' },
    limit: { type: 'number', description: 'Max results (default 20)' },
  }, async ({ query, category, limit }) => {
    const max = Math.min(limit || 20, 50);
    let sql = `SELECT t.id, t.name, t.description, t.total_views, t.created_at,
               array_agg(DISTINCT c.name) FILTER (WHERE c.name IS NOT NULL) AS categories
               FROM templates t
               LEFT JOIN template_categories tc ON tc.template_id = t.id
               LEFT JOIN categories c ON c.id = tc.category_id`;
    const params = [];
    const where = [];

    if (query) {
      params.push(`%${query}%`);
      where.push(`(t.name ILIKE $${params.length} OR t.description ILIKE $${params.length})`);
    }
    if (category) {
      params.push(category);
      where.push(`c.name ILIKE $${params.length}`);
    }

    if (where.length) sql += ' WHERE ' + where.join(' AND ');
    sql += ' GROUP BY t.id ORDER BY t.total_views DESC';
    params.push(max);
    sql += ` LIMIT $${params.length}`;

    const { rows } = await pool.query(sql, params);
    return { content: [{ type: 'text', text: JSON.stringify(rows, null, 2) }] };
  });

  guardedTool(server,'get_template', 'Get full template details including workflow JSON', {
    id: { type: 'number', description: 'Template ID' },
  }, async ({ id }) => {
    const { rows } = await pool.query(
      `SELECT t.*, array_agg(DISTINCT c.name) FILTER (WHERE c.name IS NOT NULL) AS categories
       FROM templates t
       LEFT JOIN template_categories tc ON tc.template_id = t.id
       LEFT JOIN categories c ON c.id = tc.category_id
       WHERE t.id = $1 GROUP BY t.id`, [id]
    );
    if (!rows.length) return { content: [{ type: 'text', text: 'Template not found' }] };
    return { content: [{ type: 'text', text: JSON.stringify(rows[0], null, 2) }] };
  });

  // --- Tickets ---

  guardedTool(server,'list_tickets', 'List support tickets with optional filters', {
    status: { type: 'string', description: 'Filter by status: open, in_progress, waiting, resolved, closed (optional)' },
    priority: { type: 'string', description: 'Filter by priority: low, medium, high, critical (optional)' },
    query: { type: 'string', description: 'Search in title/description (optional)' },
    limit: { type: 'number', description: 'Max results (default 20)' },
  }, async ({ status, priority, query, limit }) => {
    const max = Math.min(limit || 20, 50);
    let sql = `SELECT t.id, t.title, t.status, t.priority, t.created_at, t.updated_at,
               u.username AS created_by_name, a.username AS assigned_to_name,
               tc.name AS category_name
               FROM tickets t
               LEFT JOIN users u ON u.id = t.created_by
               LEFT JOIN users a ON a.id = t.assigned_to
               LEFT JOIN ticket_categories tc ON tc.id = t.category_id`;
    const params = [];
    const where = [];

    if (status) { params.push(status); where.push(`t.status = $${params.length}`); }
    if (priority) { params.push(priority); where.push(`t.priority = $${params.length}`); }
    if (query) { params.push(`%${query}%`); where.push(`(t.title ILIKE $${params.length} OR t.description ILIKE $${params.length})`); }

    if (where.length) sql += ' WHERE ' + where.join(' AND ');
    sql += ' ORDER BY t.updated_at DESC';
    params.push(max);
    sql += ` LIMIT $${params.length}`;

    const { rows } = await pool.query(sql, params);
    return { content: [{ type: 'text', text: JSON.stringify(rows, null, 2) }] };
  });

  guardedTool(server,'get_ticket', 'Get ticket details with comments and activity', {
    id: { type: 'number', description: 'Ticket ID' },
  }, async ({ id }) => {
    const { rows } = await pool.query(
      `SELECT t.*, u.username AS created_by_name, a.username AS assigned_to_name,
              tc.name AS category_name
       FROM tickets t
       LEFT JOIN users u ON u.id = t.created_by
       LEFT JOIN users a ON a.id = t.assigned_to
       LEFT JOIN ticket_categories tc ON tc.id = t.category_id
       WHERE t.id = $1`, [id]
    );
    if (!rows.length) return { content: [{ type: 'text', text: 'Ticket not found' }] };

    const comments = await pool.query(
      `SELECT c.*, u.username FROM ticket_comments c
       LEFT JOIN users u ON u.id = c.user_id
       WHERE c.ticket_id = $1 ORDER BY c.created_at`, [id]
    );
    const result = { ...rows[0], comments: comments.rows };
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  });

  guardedTool(server,'create_ticket', 'Create a new support ticket', {
    title: { type: 'string', description: 'Ticket title (required)' },
    description: { type: 'string', description: 'Ticket description (optional)' },
    priority: { type: 'string', description: 'Priority: low, medium, high, critical (default: medium)' },
  }, async ({ title, description, priority }) => {
    if (!title) return { content: [{ type: 'text', text: 'Error: title is required' }] };
    const { rows } = await pool.query(
      `INSERT INTO tickets (title, description, priority, created_by)
       VALUES ($1, $2, $3, 1) RETURNING id, title, status, priority, created_at`,
      [title, description || '', priority || 'medium']
    );
    return { content: [{ type: 'text', text: JSON.stringify(rows[0], null, 2) }] };
  });

  // --- Knowledge Base ---

  guardedTool(server,'search_kb_articles', 'Search knowledge base articles', {
    query: { type: 'string', description: 'Search query (optional)' },
    category: { type: 'string', description: 'Category name or slug (optional)' },
    limit: { type: 'number', description: 'Max results (default 20)' },
  }, async ({ query, category, limit }) => {
    const max = Math.min(limit || 20, 50);
    let sql = `SELECT a.id, a.title, a.slug, a.excerpt, a.status, a.view_count,
               a.helpful_yes, a.helpful_no, a.updated_at,
               kc.name AS category_name, u.username AS author_name
               FROM kb_articles a
               LEFT JOIN kb_categories kc ON kc.id = a.category_id
               LEFT JOIN users u ON u.id = a.author_id`;
    const params = [];
    const where = ["a.status = 'published'"];

    if (query) {
      params.push(query);
      where.push(`a.search_vector @@ plainto_tsquery('english', $${params.length})`);
    }
    if (category) {
      params.push(category);
      where.push(`(kc.name ILIKE $${params.length} OR kc.slug = $${params.length})`);
    }

    sql += ' WHERE ' + where.join(' AND ');
    if (query) {
      sql += ` ORDER BY ts_rank(a.search_vector, plainto_tsquery('english', $1)) DESC`;
    } else {
      sql += ' ORDER BY a.updated_at DESC';
    }
    params.push(max);
    sql += ` LIMIT $${params.length}`;

    const { rows } = await pool.query(sql, params);
    return { content: [{ type: 'text', text: JSON.stringify(rows, null, 2) }] };
  });

  guardedTool(server,'get_kb_article', 'Get full knowledge base article content', {
    id: { type: 'number', description: 'Article ID' },
  }, async ({ id }) => {
    const { rows } = await pool.query(
      `SELECT a.*, kc.name AS category_name, u.username AS author_name
       FROM kb_articles a
       LEFT JOIN kb_categories kc ON kc.id = a.category_id
       LEFT JOIN users u ON u.id = a.author_id
       WHERE a.id = $1`, [id]
    );
    if (!rows.length) return { content: [{ type: 'text', text: 'Article not found' }] };
    // Strip HTML from body for text output
    const article = rows[0];
    article.body_text = article.body.replace(/<[^>]*>/g, '');
    return { content: [{ type: 'text', text: JSON.stringify(article, null, 2) }] };
  });

  // --- Stats ---

  guardedTool(server,'get_stats', 'Get dashboard statistics (tickets, articles, templates)', {}, async () => {
    const tickets = await pool.query(
      `SELECT status, count(*)::int AS count FROM tickets GROUP BY status`
    );
    const articles = await pool.query(
      `SELECT count(*)::int AS total,
              count(*) FILTER (WHERE status = 'published')::int AS published
       FROM kb_articles`
    );
    const templates = await pool.query(`SELECT count(*)::int AS total FROM templates`);

    const result = {
      tickets: { by_status: Object.fromEntries(tickets.rows.map(r => [r.status, r.count])) },
      kb_articles: articles.rows[0],
      templates: templates.rows[0],
    };
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  });

  // --- Users (read-only) ---

  guardedTool(server,'list_users', 'List all users with their roles', {}, async () => {
    const { rows } = await pool.query(
      `SELECT id, username, email, role, created_at FROM users ORDER BY created_at`
    );
    return { content: [{ type: 'text', text: JSON.stringify(rows, null, 2) }] };
  });

  return server;
}

module.exports = { createMcpServer };
