const pool = require('../db');
const { mcpClients } = require('./mcp');

const BUILTIN_TOOLS = [
  {
    name: 'search_tickets',
    description: 'Search support tickets by keyword, status, priority, or assignee. Returns matching tickets with id, title, status, priority, created date, and assignee.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search keyword to match against ticket title and description' },
        status: { type: 'string', enum: ['open', 'in_progress', 'waiting', 'resolved', 'closed'], description: 'Filter by ticket status' },
        priority: { type: 'string', enum: ['low', 'medium', 'high', 'critical'], description: 'Filter by priority' },
        limit: { type: 'number', description: 'Max results to return (default 10)' },
      },
    },
  },
  {
    name: 'get_ticket',
    description: 'Get full details of a specific support ticket by ID, including all comments and linked executions.',
    inputSchema: {
      type: 'object',
      properties: {
        ticket_id: { type: 'number', description: 'The ticket ID' },
      },
      required: ['ticket_id'],
    },
  },
  {
    name: 'search_kb_articles',
    description: 'Search knowledge base articles by keyword. Returns matching articles with id, title, excerpt, category, and publish date.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search keyword' },
        category: { type: 'string', description: 'Filter by category name' },
        limit: { type: 'number', description: 'Max results (default 10)' },
      },
    },
  },
  {
    name: 'get_kb_article',
    description: 'Get the full content of a knowledge base article by ID, including body text, tags, and metadata.',
    inputSchema: {
      type: 'object',
      properties: {
        article_id: { type: 'number', description: 'The article ID' },
      },
      required: ['article_id'],
    },
  },
  {
    name: 'get_ticket_stats',
    description: 'Get ticket statistics: counts by status, priority breakdown, and recent activity summary.',
    inputSchema: { type: 'object', properties: {} },
  },
];

async function callBuiltinTool(toolName, args) {
  if (toolName === 'search_tickets') {
    const conditions = [];
    const params = [];
    let idx = 1;
    if (args.query) {
      conditions.push(`(t.title ILIKE $${idx} OR t.description ILIKE $${idx})`);
      params.push(`%${args.query}%`);
      idx++;
    }
    if (args.status) { conditions.push(`t.status = $${idx}`); params.push(args.status); idx++; }
    if (args.priority) { conditions.push(`t.priority = $${idx}`); params.push(args.priority); idx++; }
    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    const limit = Math.min(args.limit || 10, 50);
    const { rows } = await pool.query(
      `SELECT t.id, t.title, t.status, t.priority, t.created_at, t.updated_at,
              u.username AS created_by, a.username AS assigned_to,
              c.name AS category
       FROM tickets t
       LEFT JOIN users u ON t.created_by = u.id
       LEFT JOIN users a ON t.assigned_to = a.id
       LEFT JOIN ticket_categories c ON t.category_id = c.id
       ${where} ORDER BY t.updated_at DESC LIMIT ${limit}`, params
    );
    return JSON.stringify({ tickets: rows, count: rows.length }, null, 2);
  }

  if (toolName === 'get_ticket') {
    const { rows: [ticket] } = await pool.query(
      `SELECT t.*, u.username AS created_by_name, a.username AS assigned_to_name, c.name AS category_name
       FROM tickets t
       LEFT JOIN users u ON t.created_by = u.id
       LEFT JOIN users a ON t.assigned_to = a.id
       LEFT JOIN ticket_categories c ON t.category_id = c.id
       WHERE t.id = $1`, [args.ticket_id]
    );
    if (!ticket) return JSON.stringify({ error: 'Ticket not found' });
    const { rows: comments } = await pool.query(
      `SELECT tc.*, u.username FROM ticket_comments tc LEFT JOIN users u ON tc.user_id = u.id WHERE tc.ticket_id = $1 ORDER BY tc.created_at`, [args.ticket_id]
    );
    const { rows: executions } = await pool.query(
      `SELECT te.execution_id, te.workflow_name, te.status, te.linked_at FROM ticket_executions te WHERE te.ticket_id = $1`, [args.ticket_id]
    );
    return JSON.stringify({ ticket, comments, linked_executions: executions }, null, 2);
  }

  if (toolName === 'search_kb_articles') {
    const conditions = [`a.status = 'published'`];
    const params = [];
    let idx = 1;
    let orderBy = 'a.published_at DESC';
    if (args.query) {
      conditions.push(`a.search_vector @@ plainto_tsquery('english', $${idx})`);
      params.push(args.query);
      orderBy = `ts_rank(a.search_vector, plainto_tsquery('english', $${idx})) DESC`;
      idx++;
    }
    if (args.category) {
      conditions.push(`c.name ILIKE $${idx}`);
      params.push(`%${args.category}%`);
      idx++;
    }
    const limit = Math.min(args.limit || 10, 50);
    const { rows } = await pool.query(
      `SELECT a.id, a.title, a.slug, a.excerpt, a.view_count, a.published_at,
              c.name AS category, u.username AS author
       FROM kb_articles a
       LEFT JOIN kb_categories c ON a.category_id = c.id
       LEFT JOIN users u ON a.author_id = u.id
       WHERE ${conditions.join(' AND ')}
       ORDER BY ${orderBy} LIMIT ${limit}`, params
    );
    return JSON.stringify({ articles: rows, count: rows.length }, null, 2);
  }

  if (toolName === 'get_kb_article') {
    const { rows: [article] } = await pool.query(
      `SELECT a.*, c.name AS category_name, u.username AS author_name
       FROM kb_articles a
       LEFT JOIN kb_categories c ON a.category_id = c.id
       LEFT JOIN users u ON a.author_id = u.id
       WHERE a.id = $1`, [args.article_id]
    );
    if (!article) return JSON.stringify({ error: 'Article not found' });
    const { rows: tags } = await pool.query(
      `SELECT t.name FROM kb_article_tags at JOIN kb_tags t ON at.tag_id = t.id WHERE at.article_id = $1`, [args.article_id]
    );
    article.tags = tags.map(t => t.name);
    return JSON.stringify({ article }, null, 2);
  }

  if (toolName === 'get_ticket_stats') {
    const { rows: byStatus } = await pool.query(
      `SELECT status, COUNT(*)::int AS count FROM tickets GROUP BY status ORDER BY status`
    );
    const { rows: byPriority } = await pool.query(
      `SELECT priority, COUNT(*)::int AS count FROM tickets WHERE status NOT IN ('resolved','closed') GROUP BY priority ORDER BY priority`
    );
    const { rows: recent } = await pool.query(
      `SELECT COUNT(*)::int AS count FROM tickets WHERE created_at > NOW() - INTERVAL '7 days'`
    );
    return JSON.stringify({ by_status: byStatus, open_by_priority: byPriority, created_last_7_days: recent[0]?.count || 0 }, null, 2);
  }

  return JSON.stringify({ error: `Unknown built-in tool: ${toolName}` });
}

function getAllTools(allowedMcpServerIds) {
  const tools = [];
  for (const t of BUILTIN_TOOLS) {
    tools.push({ name: t.name, description: t.description, inputSchema: t.inputSchema, builtin: true });
  }
  for (const [id, entry] of mcpClients) {
    if (entry.status === 'connected') {
      if (allowedMcpServerIds && !allowedMcpServerIds.includes(id)) continue;
      for (const t of entry.tools) {
        tools.push({ serverId: id, name: t.name, description: t.description || '', inputSchema: t.inputSchema || { type: 'object', properties: {} }, builtin: false });
      }
    }
  }
  return tools;
}

async function callToolByName(toolName, args) {
  const isBuiltin = BUILTIN_TOOLS.some(t => t.name === toolName);
  if (isBuiltin) {
    return await callBuiltinTool(toolName, args);
  }
  for (const [id, entry] of mcpClients) {
    if (entry.status !== 'connected') continue;
    const hasTool = entry.tools.some(t => t.name === toolName);
    if (hasTool) {
      const result = await entry.client.callTool({ name: toolName, arguments: args || {} });
      if (result.content && Array.isArray(result.content)) {
        return result.content.map(c => c.text || JSON.stringify(c)).join('\n');
      }
      return JSON.stringify(result);
    }
  }
  throw new Error(`Tool "${toolName}" not found`);
}

function toolsToOpenAiFormat(tools) {
  return tools.map(t => ({
    type: 'function',
    function: { name: t.name, description: t.description, parameters: t.inputSchema },
  }));
}

function toolsToGeminiFormat(tools) {
  return [{
    functionDeclarations: tools.map(t => ({
      name: t.name,
      description: t.description,
      parameters: t.inputSchema,
    })),
  }];
}

function toolsToClaudeFormat(tools) {
  return tools.map(t => ({
    name: t.name,
    description: t.description,
    input_schema: t.inputSchema,
  }));
}

module.exports = {
  BUILTIN_TOOLS,
  callBuiltinTool,
  getAllTools,
  callToolByName,
  toolsToOpenAiFormat,
  toolsToGeminiFormat,
  toolsToClaudeFormat,
};
