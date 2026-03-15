#!/usr/bin/env node
/**
 * Standalone MCP stdio server for n8n Library.
 *
 * Usage:
 *   node mcp-stdio.js
 *
 * Requires database connection via environment variables (same as server.js).
 * Connect from Claude Desktop, Cursor, etc. as a stdio MCP server.
 *
 * Example claude_desktop_config.json:
 * {
 *   "mcpServers": {
 *     "n8n-library": {
 *       "command": "node",
 *       "args": ["/path/to/n8n-library/mcp-stdio.js"],
 *       "env": {
 *         "DB_POSTGRESDB_HOST": "localhost",
 *         "DB_POSTGRESDB_PASSWORD": "your-password",
 *         "DB_POSTGRESDB_DATABASE": "n8n_library"
 *       }
 *     }
 *   }
 * }
 */
require('dotenv/config');

const { createMcpServer } = require('./lib/mcp-server');

async function main() {
  const mcpServer = await createMcpServer();
  const { StdioServerTransport } = await import('@modelcontextprotocol/sdk/server/stdio.js');
  const transport = new StdioServerTransport();
  await mcpServer.connect(transport);
  console.error('n8n Library MCP server running on stdio');
}

main().catch(err => {
  console.error('MCP stdio server failed:', err.message);
  process.exit(1);
});
