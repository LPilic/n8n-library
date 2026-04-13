const express = require('express');
const pool = require('../db');
const { requireAuth, requireRole } = require('../lib/middleware');
const { aiLimiter } = require('../lib/middleware');
const { mcpClients, connectMcpServer, disconnectMcpServer } = require('../lib/mcp');

const router = express.Router();

// MCP CRUD endpoints
router.get('/api/mcp/servers', requireAuth, async (_req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM mcp_servers ORDER BY created_at');
    const servers = rows.map(s => {
      const entry = mcpClients.get(s.id);
      return {
        ...s,
        status: entry ? entry.status : 'disconnected',
        toolCount: entry ? entry.tools.length : 0,
        error: entry ? entry.error : null,
      };
    });
    res.json({ servers });
  } catch (e) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/api/mcp/servers', requireRole('admin'), async (req, res) => {
  try {
    const { name, type, command, args, env, url, auth_header, enabled } = req.body;
    if (!name) return res.status(400).json({ error: 'Name required' });
    const { rows } = await pool.query(
      `INSERT INTO mcp_servers (name, type, command, args, env, url, auth_header, enabled)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [name, type || 'stdio', command || '', JSON.stringify(args || []), JSON.stringify(env || {}), url || '', auth_header || '', enabled !== false]
    );
    const srv = rows[0];
    if (srv.enabled) connectMcpServer(srv).catch(() => {});
    res.json({ server: srv, message: 'MCP server added' });
  } catch (e) {
    console.error('Add MCP server error:', e.message);
    res.status(500).json({ error: 'Failed to add MCP server' });
  }
});

router.put('/api/mcp/servers/:id', requireRole('admin'), async (req, res) => {
  try {
    const { name, type, command, args, env, url, auth_header, enabled } = req.body;
    const { rows } = await pool.query(
      `UPDATE mcp_servers SET name=$1, type=$2, command=$3, args=$4, env=$5, url=$6, auth_header=$7, enabled=$8 WHERE id=$9 RETURNING *`,
      [name, type || 'stdio', command || '', JSON.stringify(args || []), JSON.stringify(env || {}), url || '', auth_header || '', enabled !== false, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    const srv = rows[0];
    await disconnectMcpServer(srv.id);
    if (srv.enabled) connectMcpServer(srv).catch(() => {});
    res.json({ server: srv, message: 'MCP server updated' });
  } catch (e) {
    console.error('Update MCP server error:', e.message);
    res.status(500).json({ error: 'Failed to update MCP server' });
  }
});

router.delete('/api/mcp/servers/:id', requireRole('admin'), async (req, res) => {
  try {
    await disconnectMcpServer(parseInt(req.params.id));
    await pool.query('DELETE FROM mcp_servers WHERE id = $1', [req.params.id]);
    res.json({ message: 'Deleted' });
  } catch (e) {
    console.error('Delete MCP server error:', e.message);
    res.status(500).json({ error: 'Failed to delete MCP server' });
  }
});

router.post('/api/mcp/servers/:id/reconnect', requireRole('admin'), async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM mcp_servers WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    const result = await connectMcpServer(rows[0]);
    res.json({ message: result.status === 'connected' ? `Connected with ${result.toolCount} tools` : 'Connection failed', ...result });
  } catch (e) {
    console.error('Reconnect MCP server error:', e.message);
    res.status(500).json({ error: 'Failed to reconnect MCP server' });
  }
});

router.get('/api/mcp/tools', requireAuth, async (_req, res) => {
  const tools = [];
  for (const [id, entry] of mcpClients) {
    if (entry.status === 'connected') {
      for (const t of entry.tools) {
        tools.push({ serverId: id, name: t.name, description: t.description || '', inputSchema: t.inputSchema });
      }
    }
  }
  res.json({ tools });
});

router.post('/api/mcp/tools/call', requireAuth, aiLimiter, async (req, res) => {
  try {
    const { serverId, toolName, args } = req.body;
    const entry = mcpClients.get(serverId);
    if (!entry || entry.status !== 'connected') return res.status(400).json({ error: 'MCP server not connected' });
    const result = await entry.client.callTool({ name: toolName, arguments: args || {} });
    res.json({ result });
  } catch (e) {
    console.error('MCP tool call error:', e.message);
    res.status(500).json({ error: 'Tool call failed' });
  }
});

module.exports = router;
