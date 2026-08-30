import * as assert from 'assert';
import { MCPClientManager } from '../src/mcp/client';
import { ToolRegistry } from '../src/tools/tool-registry';

describe('Direct MCP Client Manager', () => {
  const outputChannel = {
    appendLine: () => {},
    dispose: () => {},
  } as any;

  it('should register dynamic tools into ToolRegistry and execute them', async () => {
    const toolRegistry = new ToolRegistry(outputChannel);
    const mcpClient = new MCPClientManager(toolRegistry, outputChannel);

    // Register a dynamic tool simulating an external MCP server (e.g. postgres)
    const disposable = toolRegistry.registerDynamicTool(
      {
        type: 'function',
        function: {
          name: 'mcp_postgres_query',
          description: '[MCP: postgres] Execute a SQL query',
          parameters: {
            type: 'object',
            properties: {
              sql: { type: 'string', description: 'SQL query string' },
            },
            required: ['sql'],
          },
        },
      },
      async (args) => {
        return `Query result for: ${args.sql} -> 2 rows returned`;
      },
      'postgres'
    );

    const toolDefs = toolRegistry.getToolDefinitions();
    const dynamicTool = toolDefs.find((t) => t.function.name === 'mcp_postgres_query');
    assert.ok(dynamicTool, 'Dynamic MCP tool should be in tool definitions');
    assert.strictEqual(dynamicTool?.function.description, '[MCP: postgres] Execute a SQL query');

    const result = await toolRegistry.executeTool('mcp_postgres_query', { sql: 'SELECT * FROM users' });
    assert.strictEqual(result, 'Query result for: SELECT * FROM users -> 2 rows returned');

    // Unregister
    toolRegistry.unregisterDynamicTools('postgres');
    const toolDefsAfter = toolRegistry.getToolDefinitions();
    assert.strictEqual(
      toolDefsAfter.some((t) => t.function.name === 'mcp_postgres_query'),
      false
    );

    disposable.dispose();
    mcpClient.dispose();
  });
});
