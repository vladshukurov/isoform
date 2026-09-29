// Runs the Isoform MCP server over stdio. Agents start it themselves:
//   claude mcp add isoform -- node <isoform>/node_modules/tsx/dist/cli.mjs <isoform>/mcp/server.ts
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './core';

await createServer().connect(new StdioServerTransport());
