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
import { WorkspaceIndexer } from '../agent/workspace-indexer';
import type { DomainRulesManager } from '../domains/domain-rules-manager';
import type { SubagentManager } from '../agent/subagent-manager';
import type { CheckpointManager } from '../agent/checkpoint-manager';
import type { AgentRunOptions } from '../agent/approval';

export class ToolRegistry implements vscode.Disposable {
  private disposables: vscode.Disposable[] = [];
  private outputChannel: vscode.OutputChannel;
  private domainRulesManager?: DomainRulesManager;
  private subagentManager?: SubagentManager;
  private checkpointManager?: CheckpointManager;

  public readonly fileTools: FileTools;
  public readonly editTools: EditTools;
  public readonly terminalTools: TerminalTools;
  public readonly workspaceTools: WorkspaceTools;

  private dynamicTools = new Map<
    string,
    {
      definition: {
        type: 'function';
        function: { name: string; description: string; parameters: Record<string, unknown> };
      };
      handler: (args: Record<string, unknown>) => Promise<string>;
      serverId?: string;
    }
  >();

  constructor(
    outputChannel: vscode.OutputChannel,
    domainRulesManager?: DomainRulesManager
  ) {
    this.outputChannel = outputChannel;
    this.domainRulesManager = domainRulesManager;
    this.fileTools = new FileTools(outputChannel);
    this.editTools = new EditTools(outputChannel);
    this.terminalTools = new TerminalTools(outputChannel);
    this.workspaceTools = new WorkspaceTools(outputChannel);
  }

  public setDomainRulesManager(manager: DomainRulesManager): void {
    this.domainRulesManager = manager;
  }

  public setSubagentManager(manager: SubagentManager): void {
    this.subagentManager = manager;
  }

  public setCheckpointManager(manager: CheckpointManager): void {
    this.checkpointManager = manager;
    this.fileTools.setCheckpointManager(manager);
    this.editTools.setCheckpointManager(manager);
  }

  /**
   * Register a dynamic tool (e.g. from an external MCP server).
   */
  public registerDynamicTool(
    definition: {
      type: 'function';
      function: { name: string; description: string; parameters: Record<string, unknown> };
    },
    handler: (args: Record<string, unknown>) => Promise<string>,
    serverId?: string
  ): vscode.Disposable {
    const toolName = definition.function.name;
    this.dynamicTools.set(toolName, { definition, handler, serverId });
    this.log(`Dynamic MCP tool registered: ${toolName}${serverId ? ` (server: ${serverId})` : ''}`);

    return {
      dispose: () => {
        this.dynamicTools.delete(toolName);
        this.log(`Dynamic MCP tool unregistered: ${toolName}`);
      },
    };
  }

  /**
   * Unregister all dynamic tools registered by a specific server.
   */
  public unregisterDynamicTools(serverId: string): void {
    for (const [toolName, tool] of this.dynamicTools.entries()) {
      if (tool.serverId === serverId) {
        this.dynamicTools.delete(toolName);
        this.log(`Dynamic MCP tool removed for server "${serverId}": ${toolName}`);
      }
    }
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
    const baseTools: Array<{
      type: 'function';
      function: { name: string; description: string; parameters: Record<string, unknown> };
    }> = [
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
      {
        type: 'function' as const,
        function: {
          name: 'ag_workspaceDigest',
          description:
            'Get a compact overview and categorized digest of all relevant files and folders in the workspace.',
          parameters: {
            type: 'object',
            properties: {
              maxFiles: {
                type: 'number',
                description: 'Maximum number of files to index (default: 60).',
              },
            },
            required: [],
          },
        },
      },
      {
        type: 'function' as const,
        function: {
          name: 'ag_getWorkspaceRules',
          description:
            'Inspect active workspace rules, domain directives, and coding guidelines (.agents, .cursor, .windsurf, Copilot, Claude).',
          parameters: {
            type: 'object',
            properties: {
              activeFilePath: {
                type: 'string',
                description: 'Optional relative file path to filter pattern-matched rules (globs).',
              },
            },
            required: [],
          },
        },
      },
      {
        type: 'function' as const,
        function: {
          name: 'ag_delegateTask',
          description:
            'Delegate an isolated mission to a specialized subagent (coder, security, reviewer, planner) with its own independent reasoning context.',
          parameters: {
            type: 'object',
            properties: {
              personaId: {
                type: 'string',
                enum: ['coder', 'security', 'reviewer', 'planner'],
                description: 'The specialized persona to execute this sub-task.',
              },
              taskDescription: {
                type: 'string',
                description: 'Detailed instructions and mission objective for the subagent.',
              },
              contextSummary: {
                type: 'string',
                description: 'Optional relevant file snippets, context, or requirements to pass to the subagent.',
              },
            },
            required: ['personaId', 'taskDescription'],
          },
        },
      },
      {
        type: 'function' as const,
        function: {
          name: 'ag_delegateParallelTasks',
          description:
            'Delegate multiple tasks simultaneously to specialized subagents in parallel (e.g. running a security audit and a test review concurrently).',
          parameters: {
            type: 'object',
            properties: {
              tasks: {
                type: 'array',
                description: 'List of tasks to execute concurrently.',
                items: {
                  type: 'object',
                  properties: {
                    personaId: {
                      type: 'string',
                      enum: ['coder', 'security', 'reviewer', 'planner'],
                      description: 'The persona for this sub-task.',
                    },
                    taskDescription: {
                      type: 'string',
                      description: 'Detailed mission instructions.',
                    },
                    contextSummary: {
                      type: 'string',
                      description: 'Optional context summary or file snippets.',
                    },
                  },
                  required: ['personaId', 'taskDescription'],
                },
              },
            },
            required: ['tasks'],
          },
        },
      },
      // ─── Checkpoint & Rollback Tools ─────────────────────────────────────
      {
        type: 'function' as const,
        function: {
          name: 'ag_createCheckpoint',
          description:
            'Create a rollback checkpoint of the workspace before performing risky, multi-file or complex mutations.',
          parameters: {
            type: 'object',
            properties: {
              label: {
                type: 'string',
                description: 'Description or reason for the checkpoint (e.g. "Before refactoring auth module").',
              },
            },
            required: ['label'],
          },
        },
      },
      {
        type: 'function' as const,
        function: {
          name: 'ag_rollbackToCheckpoint',
          description:
            'Rollback workspace changes to a previous checkpoint. Reverts all modified files to original content and removes newly created files.',
          parameters: {
            type: 'object',
            properties: {
              checkpointId: {
                type: 'string',
                description: 'Optional checkpoint ID to revert to. If omitted, reverts the most recent active/completed checkpoint.',
              },
            },
            required: [],
          },
        },
      },
      {
        type: 'function' as const,
        function: {
          name: 'ag_listCheckpoints',
          description:
            'List all available workspace checkpoints, their status (active, completed, reverted) and affected files.',
          parameters: {
            type: 'object',
            properties: {},
            required: [],
          },
        },
      },
    ];

    const dynamic = [...this.dynamicTools.values()].map((d) => d.definition);
    return [...baseTools, ...dynamic];
  }

  /**
   * Execute a tool by name with the given arguments.
   */
  public async executeTool(
    name: string,
    args: Record<string, unknown>,
    stream?: vscode.ChatResponseStream | ((text: string) => void),
    options?: AgentRunOptions
  ): Promise<string> {
    this.log(`Executing tool: ${name} with args: ${JSON.stringify(args)}`);

    // Check dynamic MCP tools first
    if (this.dynamicTools.has(name)) {
      const dynamic = this.dynamicTools.get(name)!;
      try {
        return await dynamic.handler(args);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.log(`Dynamic MCP tool error: ${name} — ${msg}`);
        return `Error executing dynamic MCP tool ${name}: ${msg}`;
      }
    }

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

        case 'ag_workspaceDigest': {
          const digest = await WorkspaceIndexer.getWorkspaceDigest(
            (args.maxFiles as number) || 60
          );
          return digest.summaryText;
        }

        case 'ag_getWorkspaceRules': {
          if (!this.domainRulesManager) {
            return JSON.stringify({
              totalRulesInWorkspace: 0,
              activeRulesCount: 0,
              error: 'No DomainRulesManager instance is configured.',
              rules: [],
            });
          }
          const activeFilePath = args.activeFilePath as string | undefined;
          const activeRules = this.domainRulesManager.getActiveRules(activeFilePath);
          const summary = this.domainRulesManager.getSummary();
          const prompt = this.domainRulesManager.getAggregatedRulesPrompt(activeFilePath);

          return JSON.stringify(
            {
              totalRulesInWorkspace: summary.totalRules,
              activeRulesCount: activeRules.length,
              filteredForFile: activeFilePath || 'all',
              sourcesFound: summary.sources,
              rules: activeRules.map((r) => ({
                id: r.id,
                source: r.source,
                name: r.name,
                title: r.title || r.name,
                filePath: r.filePath,
                path: r.filePath,
                alwaysApply: r.alwaysApply,
                globs: r.globs,
                description: r.description,
                content: r.content,
              })),
              prompt,
            },
            null,
            2
          );
        }

        case 'ag_delegateTask': {
          if (!this.subagentManager) {
            return 'Error: SubagentManager is not configured on ToolRegistry.';
          }
          const taskResult = await this.subagentManager.runSubagent(
            {
              personaId: (args.personaId as any) || 'coder',
              taskDescription: args.taskDescription as string,
              contextSummary: args.contextSummary as string | undefined,
            },
            stream,
            options,
            options?.currentDepth || 0
          );

          return JSON.stringify(
            {
              status: taskResult.status,
              persona: taskResult.personaName,
              summary: taskResult.summary,
              toolCallsExecuted: taskResult.toolCallsCount,
              durationMs: taskResult.durationMs,
              error: taskResult.error,
            },
            null,
            2
          );
        }

        case 'ag_delegateParallelTasks': {
          if (!this.subagentManager) {
            return 'Error: SubagentManager is not configured on ToolRegistry.';
          }
          const rawTasks = (args.tasks as any[]) || [];
          const configs = rawTasks.map((t, i) => ({
            taskId: t.taskId || `parallel_${i + 1}`,
            personaId: t.personaId || 'coder',
            taskDescription: t.taskDescription || '',
            contextSummary: t.contextSummary,
          }));

          const report = await this.subagentManager.runParallelSubagents(
            configs,
            stream,
            options,
            options?.currentDepth || 0
          );

          return JSON.stringify(
            {
              totalTasks: report.totalTasks,
              successfulTasks: report.successfulTasks,
              failedTasks: report.failedTasks,
              totalDurationMs: report.totalDurationMs,
              results: report.results.map((r) => ({
                taskId: r.taskId,
                persona: r.personaName,
                status: r.status,
                summary: r.summary,
                toolsUsed: r.toolCallsCount,
                durationMs: r.durationMs,
                error: r.error,
              })),
            },
            null,
            2
          );
        }

        case 'ag_createCheckpoint': {
          if (!this.checkpointManager) {
            return 'Error: CheckpointManager is not configured on ToolRegistry.';
          }
          const label = (args.label as string) || 'Manual Checkpoint';
          const ckpt = this.checkpointManager.createCheckpoint(label, 'agent');
          return `Successfully created checkpoint "${ckpt.id}" (${ckpt.label}). Workspace modifications will now be tracked with Copy-on-Write rollback capability.`;
        }

        case 'ag_rollbackToCheckpoint': {
          if (!this.checkpointManager) {
            return 'Error: CheckpointManager is not configured on ToolRegistry.';
          }
          const res = await this.checkpointManager.rollbackCheckpoint(args.checkpointId as string | undefined);
          return JSON.stringify(
            {
              status: res.success ? 'success' : 'partial_error',
              checkpointId: res.checkpointId,
              restoredFiles: res.restoredFiles,
              deletedFiles: res.deletedFiles,
              errors: res.errors,
            },
            null,
            2
          );
        }

        case 'ag_listCheckpoints': {
          if (!this.checkpointManager) {
            return 'Error: CheckpointManager is not configured on ToolRegistry.';
          }
          const list = this.checkpointManager.listCheckpoints();
          return JSON.stringify(list, null, 2);
        }

        default:
          return `Unknown tool: ${name}`;
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.log(`Tool error: ${name} — ${msg}`);
      return `Error executing ${name}: ${msg}`;
    }
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
