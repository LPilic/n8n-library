const pool = require('../db');

const mcpClients = new Map(); // id → { client, transport, tools[], status, error }

async function connectMcpServer(serverConfig) {
  const id = serverConfig.id;
  await disconnectMcpServer(id);

  try {
    const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
    const client = new Client({ name: 'n8n-library', version: '1.0.0' });
    let transport;

    if (serverConfig.type === 'stdio') {
      const { StdioClientTransport } = await import('@modelcontextprotocol/sdk/client/stdio.js');
      const cmdParts = serverConfig.command.split(/\s+/);
      const cmd = cmdParts[0];
      const cmdArgs = [...cmdParts.slice(1), ...(serverConfig.args || [])];
      // Allowlist only safe env vars — don't inherit full process.env
      const safeEnvKeys = ['PATH', 'HOME', 'NODE_ENV', 'LANG', 'LC_ALL', 'TMPDIR', 'TMP', 'TEMP'];
      const baseEnv = {};
      for (const k of safeEnvKeys) {
        if (process.env[k]) baseEnv[k] = process.env[k];
      }
      const env = { ...baseEnv, ...(serverConfig.env || {}) };
      transport = new StdioClientTransport({ command: cmd, args: cmdArgs, env });
    } else if (serverConfig.type === 'http') {
      const { StreamableHTTPClientTransport } = await import('@modelcontextprotocol/sdk/client/streamableHttp.js');
      const headers = {};
      if (serverConfig.auth_header) headers['Authorization'] = serverConfig.auth_header;
      transport = new StreamableHTTPClientTransport(new URL(serverConfig.url), { requestInit: { headers } });
    }

    await client.connect(transport);
    const { tools } = await client.listTools();
    mcpClients.set(id, { client, transport, tools: tools || [], status: 'connected', error: null });
    console.log(`MCP server "${serverConfig.name}" connected with ${(tools || []).length} tools`);
    return { status: 'connected', toolCount: (tools || []).length };
  } catch (e) {
    console.error(`MCP server "${serverConfig.name}" failed:`, e.message);
    mcpClients.set(id, { client: null, transport: null, tools: [], status: 'error', error: e.message });
    return { status: 'error', error: e.message };
  }
}

async function disconnectMcpServer(id) {
  const entry = mcpClients.get(id);
  if (entry) {
    try { if (entry.transport) await entry.transport.close(); } catch (e) {}
    try { if (entry.client) await entry.client.close(); } catch (e) {}
    mcpClients.delete(id);
  }
}

async function reconnectAllMcp() {
  try {
    const { rows } = await pool.query('SELECT * FROM mcp_servers WHERE enabled = true');
    for (const srv of rows) {
      connectMcpServer(srv).catch(e => console.warn(`MCP auto-connect failed for ${srv.name}:`, e.message));
    }
  } catch (e) { console.warn('Could not load MCP servers:', e.message); }
}

module.exports = {
  mcpClients,
  connectMcpServer,
  disconnectMcpServer,
  reconnectAllMcp,
};
