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
      name: 'ag_replaceInFile',
      description: 'Precise code edit tool. Replace a specific unique code block in a file with new replacement code.',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Relative file path from workspace root' },
          targetContent: { type: 'string', description: 'Exact unique target substring to replace' },
          replacementContent: { type: 'string', description: 'Replacement string' },
        },
        required: ['path', 'targetContent', 'replacementContent'],
      },
    },
    {
      name: 'ag_multiReplaceInFile',
      description: 'Apply multiple non-contiguous substring code block replacements in a single file.',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Relative file path from workspace root' },
          replacements: {
            type: 'array',
            description: 'List of target and replacement chunks',
            items: {
              type: 'object',
              properties: {
                targetContent: { type: 'string', description: 'Exact target text to find' },
                replacementContent: { type: 'string', description: 'Replacement text' },
              },
              required: ['targetContent', 'replacementContent'],
            },
          },
        },
        required: ['path', 'replacements'],
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
    {
      name: 'ag_getSelection',
      description: 'Get the currently selected text or active line in the editor.',
      inputSchema: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
    {
      name: 'ag_getDiagnostics',
      description: 'Get current diagnostics (errors, warnings) for a file or the workspace.',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Optional relative file path' },
        },
        required: [],
      },
    },
  ];
}
