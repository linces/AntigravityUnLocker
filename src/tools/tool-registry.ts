/**
 * AG Universal AI — Tool Registry
 *
 * Registers Language Model Tools that the AI agent can invoke
 * during chat interactions. These tools enable agentic workflows
 * like reading files, running commands, and searching the workspace.
 */

import * as vscode from 'vscode';
import { FileTools } from './file-tools';
import { EditTools, ReplacementChunk } from './edit-tools';
import { TerminalTools } from './terminal-tools';
import { WorkspaceTools } from './workspace-tools';

export class ToolRegistry implements vscode.Disposable {
  private disposables: vscode.Disposable[] = [];
  private outputChannel: vscode.OutputChannel;

  // Thread-safe cache for inline completions
  private cache = new Map<string, string>();
  private readonly maxCacheSize = 50;
  private readonly activeRequests = new Set<string>();

  public readonly fileTools: FileTools;
  public readonly editTools: EditTools;
  public readonly terminalTools: TerminalTools;
  public readonly workspaceTools: WorkspaceTools;

  // Thread-safe cache for inline completions
  private cache = new Map<string, string>();
  private readonly maxCacheSize = 50;
  private readonly activeRequests = new Set<string>();

  constructor(outputChannel: vscode.OutputChannel) {
    this.outputChannel = outputChannel;
    this.fileTools = new FileTools(outputChannel);
    this.editTools = new EditTools(outputChannel);
    this.terminalTools = new TerminalTools(outputChannel);
    this.workspaceTools = new WorkspaceTools(outputChannel);
  }

  /**
   * Register all tools with VS Code.
   */
  public register(context: vscode.ExtensionContext): void {
    // Register tool commands that the chat participant can invoke
    this.registerToolCommands(context);
    this.log('Tool registry initialized with file, terminal, and workspace tools');
  }

  /**
   * Get the tool definitions for passing to the LLM.
   */
  public getToolDefinitions(): Array<{
    type: 'function';
    function: { name: string; description: string; parameters: Record<string, unknown> };
  }> {
    return [
      // ─── File Tools ───────────────────────────────────────────────────────
      {
        type: 'function' as const,
        function: {
          name: 'ag_readFile',
          description:
            'Read the contents of a file in the workspace. Returns the full file text.',
          parameters: {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description:
                  'Relative path to the file from workspace root (e.g., "src/index.ts")',
              },
              startLine: {
                type: 'number',
                description: 'Optional start line (1-indexed). Omit to read entire file.',
              },
              endLine: {
                type: 'number',
                description: 'Optional end line (1-indexed, inclusive).',
              },
            },
            required: ['path'],
          },
        },
      },
      {
        type: 'function' as const,
        function: {
          name: 'ag_writeFile',
          description:
            'Write content to a file in the workspace. Creates the file if it does not exist.',
          parameters: {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description: 'Relative path to the file from workspace root.',
              },
              content: {
                type: 'string',
                description: 'The full content to write to the file.',
              },
            },
            required: ['path', 'content'],
          },
        },
      },
      {
        type: 'function' as const,
        function: {
          name: 'ag_replaceInFile',
          description:
            'Precise code edit tool. Replace a specific unique code block in a file with new replacement code.',
          parameters: {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description: 'Relative path to the file from workspace root.',
              },
              targetContent: {
                type: 'string',
                description: 'Exact text substring to find and replace. Must match target file uniquely.',
              },
              replacementContent: {
                type: 'string',
                description: 'Exact text replacement string.',
              },
            },
            required: ['path', 'targetContent', 'replacementContent'],
          },
        },
      },
      {
        type: 'function' as const,
        function: {
          name: 'ag_multiReplaceInFile',
          description:
            'Apply multiple non-contiguous substring code block replacements in a single file.',
          parameters: {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description: 'Relative path to the file from workspace root.',
              },
              replacements: {
                type: 'array',
                description: 'Array of replacement objects with targetContent and replacementContent.',
                items: {
                  type: 'object',
                  properties: {
                    targetContent: { type: 'string', description: 'Exact target text to find.' },
                    replacementContent: { type: 'string', description: 'Replacement text.' },
                  },
                  required: ['targetContent', 'replacementContent'],
                },
              },
            },
            required: ['path', 'replacements'],
          },
        },
      },
      {
        type: 'function' as const,
        function: {
          name: 'ag_listFiles',
          description:
            'List files and directories in a workspace folder. Returns names with type indicators.',
          parameters: {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description:
                  'Relative path to list (e.g., "src/"). Use "" or "." for workspace root.',
              },
              recursive: {
                type: 'boolean',
                description: 'If true, list files recursively. Default: false.',
              },
            },
            required: ['path'],
          },
        },
      },

      // ─── Terminal Tools ───────────────────────────────────────────────────
      {
        type: 'function' as const,
        function: {
          name: 'ag_runCommand',
          description:
            'Run a shell command in the workspace terminal. Returns stdout and stderr.',
          parameters: {
            type: 'object',
            properties: {
              command: {
                type: 'string',
                description: 'The shell command to execute.',
              },
              cwd: {
                type: 'string',
                description: 'Working directory (relative to workspace). Default: workspace root.',
              },
            },
            required: ['command'],
          },
        },
      },

      // ─── Workspace Tools ──────────────────────────────────────────────────
      {
        type: 'function' as const,
        function: {
          name: 'ag_searchWorkspace',
          description:
            'Search for text or regex patterns across workspace files. Returns matching lines.',
          parameters: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'Search query (text or regex pattern).',
              },
              includes: {
                type: 'string',
                description: 'Glob pattern for files to include (e.g., "**/*.ts"). Default: all files.',
              },
              maxResults: {
                type: 'number',
                description: 'Maximum results to return. Default: 20.',
              },
            },
            required: ['query'],
          },
        },
      },
      {
        type: 'function' as const,
        function: {
          name: 'ag_getSelection',
          description:
            'Get the currently selected text in the active editor. Returns the selection and file info.',
          parameters: {
            type: 'object',
            properties: {},
            required: [],
          },
        },
      },
      {
        type: 'function' as const,
        function: {
          name: 'ag_getDiagnostics',
          description:
            'Get current diagnostics (errors, warnings) for a file or the entire workspace.',
          parameters: {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description:
                  'Relative file path to get diagnostics for. Omit for all workspace diagnostics.',
              },
            },
            required: [],
          },
        },
      },
    ];
  }

  /**
   * Execute a tool by name with the given arguments.
   */
  /**
   * Execute a tool by name with the given arguments.
   */
  public async executeTool(
    name: string,
    args: Record<string, unknown>
  ): Promise<string> {
    this.log(`Executing tool: ${name} with args: ${JSON.stringify(args)}`);

    try {
      switch (name) {
        case 'ag_readFile':
          return await this.fileTools.readFile(
            args.path as string,
            args.startLine as number | undefined,
            args.endLine as number | undefined
          );

        case 'ag_writeFile':
          return await this.fileTools.writeFile(
            args.path as string,
            args.content as string
          );

        case 'ag_replaceInFile':
          return await this.editTools.replaceInFile(
            args.path as string,
            args.targetContent as string,
            args.replacementContent as string
          );

        case 'ag_multiReplaceInFile':
          return await this.editTools.multiReplaceInFile(
            args.path as string,
            args.replacements as ReplacementChunk[]
          );

        case 'ag_listFiles':
          return await this.fileTools.listFiles(
            args.path as string,
            (args.recursive as boolean) || false
          );

        case 'ag_runCommand':
          return await this.terminalTools.runCommand(
            args.command as string,
            args.cwd as string | undefined
          );

        case 'ag_searchWorkspace':
          return await this.workspaceTools.searchWorkspace(
            args.query as string,
            args.includes as string | undefined,
            (args.maxResults as number) || 20
          );

        case 'ag_getSelection':
          return this.workspaceTools.getSelection();

        case 'ag_getDiagnostics':
          return this.workspaceTools.getDiagnostics(args.path as string | undefined);

        default:
          return `Unknown tool: ${name}`;
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.log(`Tool error: ${name} — ${msg}`);
      return `Error executing ${name}: ${msg}`;
    }
  }

  /**
   * Thread-safe cache getter with concurrent request prevention.
   */
  private async getCachedCompletion(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken,
    config: vscode.WorkspaceConfiguration
  ): Promise<string | undefined> {
    const prompt = this.buildCompletionPrompt(document, position);
    const cacheKey = this.hashString(prompt.slice(-200));

    if (this.activeRequests.has(cacheKey)) {
      return new Promise<string>((resolve) => {
        const check = () => {
          if (!this.activeRequests.has(cacheKey)) {
            const cached = this.cache.get(cacheKey);
            if (cached) resolve(cached);
            else resolve(undefined);
          } else {
            setTimeout(check, 10);
          }
        };
        check();
      });
    }

    this.activeRequests.add(cacheKey);

    try {
      const cached = this.cache.get(cacheKey);
      if (cached) {
        return cached;
      }

      return undefined;
    } finally {
      this.activeRequests.delete(cacheKey);
    }
  }

  /**
   * Thread-safe cache setter with size management.
   */
  private cacheResult(key: string, value: string): void {
    if (this.cache.size >= this.maxCacheSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }
    this.cache.set(key, value);
  }

  /**
   * Hash string for cache key generation.
   */
  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash |= 0;
    }
    return hash.toString(36);
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  private registerToolCommands(context: vscode.ExtensionContext): void {
    // Register as VS Code commands so they can be invoked programmatically
    context.subscriptions.push(
      vscode.commands.registerCommand('ag-universal-ai.tool.readFile', (path: string) =>
        this.fileTools.readFile(path)
      ),
      vscode.commands.registerCommand(
        'ag-universal-ai.tool.writeFile',
        (path: string, content: string) => this.fileTools.writeFile(path, content)
      ),
      vscode.commands.registerCommand('ag-universal-ai.tool.runCommand', (cmd: string) =>
        this.terminalTools.runCommand(cmd)
      ),
      vscode.commands.registerCommand('ag-universal-ai.tool.search', (query: string) =>
        this.workspaceTools.searchWorkspace(query)
      )
    );
  }

  private log(message: string): void {
    const timestamp = new Date().toISOString();
    this.outputChannel.appendLine(`[${timestamp}] [ToolRegistry] ${message}`);
  }

  public dispose(): void {
    for (const d of this.disposables) {
      d.dispose();
    }
  }
}
