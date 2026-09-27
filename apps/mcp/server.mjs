import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { TOOLS, INSTRUCTIONS, callTool, mcpResult } from './tools.mjs';

const server = new McpServer({ name: 'cookhoard-local', version: '0.1.0' }, { instructions: INSTRUCTIONS });
for (const tool of TOOLS) {
  server.registerTool(tool.name, {
    description: tool.description,
    inputSchema: tool.schema,
    annotations: { readOnlyHint: !!tool.readOnly, destructiveHint: false, idempotentHint: ['add_menu_missing', 'set_kitchen_item', 'remove_kitchen_item'].includes(tool.name), openWorldHint: false },
  }, async (args) => {
    try { return mcpResult(await callTool(tool.name, args)); }
    catch (error) { return { isError: true, content: [{ type: 'text', text: JSON.stringify({ error: error.message }) }] }; }
  });
}
await server.connect(new StdioServerTransport());
