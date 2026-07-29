/**
 * AG Universal AI — MCP Tool Definitions
 *
 * Exposes internal tools as standardized Model Context Protocol (MCP) tool schemas.
 */

export interface MCPToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export function getMCPToolDefinitions(): MCPToolDefinition[] {
  return [
    {
      name: 'ag_readFile',
      description: 'Read the contents of a file in the workspace.',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Relative file path from workspace root' },
          startLine: { type: 'number', description: 'Optional 1-indexed start line' },
          endLine: { type: 'number', description: 'Optional 1-indexed end line' },
        },
        required: ['path'],
      },
    },
    {
      name: 'ag_writeFile',
      description: 'Write content to a file in the workspace.',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Relative file path from workspace root' },
          content: { type: 'string', description: 'Full content to write' },
        },
        required: ['path', 'content'],
      },
    },
    {
      name: 'ag_listFiles',
      description: 'List files and directories in a workspace folder.',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Relative folder path' },
          recursive: { type: 'boolean', description: 'List recursively' },
        },
        required: ['path'],
      },
    },
    {
      name: 'ag_runCommand',
      description: 'Execute a terminal command in the workspace.',
      inputSchema: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'Shell command string' },
          cwd: { type: 'string', description: 'Optional working directory' },
        },
        required: ['command'],
      },
    },
    {
      name: 'ag_searchWorkspace',
      description: 'Search for text or regex pattern across workspace files.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search term or pattern' },
          includes: { type: 'string', description: 'Optional glob pattern filter' },
          maxResults: { type: 'number', description: 'Maximum matches to return' },
        },
        required: ['query'],
      },
    },
  ];
}
