/**
 * AG Universal AI — Extension Entry Point
 *
 * Orchestrates the initialization and lifecycle of all extension components:
 * Provider System, Language Model Chat Provider, Inline Completion,
 * Chat Participant, Tool Registry, MCP Server, Agent Engine (Planner & Executor),
 * Tree View Sidebar, Webview Dashboard, Status Bar, and Commands.
 */

import * as vscode from 'vscode';
import { ProviderManager } from './providers/provider-manager';
import { AGLanguageModelChatProvider } from './lm/chat-provider';
import { AGChatParticipant } from './chat/participant';
import { AGInlineCompletionProvider } from './completion/inline-provider';
import { ToolRegistry } from './tools/tool-registry';
import { MCPServer } from './mcp/server';
import { AgentEngine } from './agent/engine';
import { AgentPlanner } from './agent/planner';
import { PlanExecutor } from './agent/executor';
import { AGStatusBar } from './ui/status-bar';
import { AGTreeDataProvider } from './ui/tree-view';
import { AGWebviewDashboard } from './ui/webview-dashboard';
import { AGSidebarWebviewProvider } from './ui/sidebar-webview';
import {
  showProviderPicker,
  showModelPicker,
  showApiKeyDialog,
  showHealthCheck,
} from './ui/quick-pick';

import { SessionManager } from './chat/session-manager';
import { MCPClientManager } from './mcp/client';
import { AGDiffProvider } from './ui/diff-provider';

let outputChannel: vscode.OutputChannel;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  // ─── 1. Output Channel ──────────────────────────────────────────────────
  outputChannel = vscode.window.createOutputChannel('AG Universal AI');
  context.subscriptions.push(outputChannel);
  log('Activating AG Universal AI extension (Phase 3 Full Capabilities)...');

  // ─── 2. Provider Manager ────────────────────────────────────────────────
  const providerManager = new ProviderManager(context, outputChannel);
  context.subscriptions.push(providerManager);

  await providerManager.initialize();
  log(`Provider Manager ready. ${providerManager.getProviderIds().length} providers loaded.`);

  // ─── 3. Language Model Chat Provider ────────────────────────────────────
  const lmProvider = new AGLanguageModelChatProvider(providerManager, outputChannel);
  context.subscriptions.push(lmProvider);
  lmProvider.register();

  // ─── 4. Inline Completion Provider ──────────────────────────────────────
  const inlineProvider = new AGInlineCompletionProvider(providerManager, outputChannel);
  context.subscriptions.push(inlineProvider);
  inlineProvider.register(context);
  log('Inline completion provider activated (Ghost Text FIM)');

  // ─── 5. Tool Registry ──────────────────────────────────────────────────
  const toolRegistry = new ToolRegistry(outputChannel);
  context.subscriptions.push(toolRegistry);
  toolRegistry.register(context);
  log('Tool registry activated (workspace/file/terminal tools)');

  // ─── 5.5. Diff Provider & Direct MCP Client Manager ───────────────────────
  const diffProvider = new AGDiffProvider();
  context.subscriptions.push(diffProvider);
  diffProvider.register(context);

  const mcpClient = new MCPClientManager(toolRegistry, outputChannel);
  context.subscriptions.push(mcpClient);
  await mcpClient.initialize();
  log('Direct MCP Client Manager initialized (stdio JSON-RPC)');

  // ─── 6. Embedded MCP Server ────────────────────────────────────────────
  const mcpServer = new MCPServer(toolRegistry, outputChannel);
  context.subscriptions.push(mcpServer);
  mcpServer.start();
  log('Embedded Model Context Protocol (MCP) server running');

  // ─── 7. Agent Engine & Planner ─────────────────────────────────────────
  const agentEngine = new AgentEngine(providerManager, toolRegistry, outputChannel);
  const agentPlanner = new AgentPlanner(providerManager);
  const planExecutor = new PlanExecutor(toolRegistry);
  context.subscriptions.push(agentEngine);
  log('Agent engine & planner activated');

  // ─── 8. Chat Participant (@ag) ──────────────────────────────────────────
  const chatParticipant = new AGChatParticipant(lmProvider, providerManager, outputChannel);
  context.subscriptions.push(chatParticipant);
  chatParticipant.register();

  // ─── 8.5. Session Manager ───────────────────────────────────────────────
  const sessionManager = new SessionManager(context.workspaceState);
  context.subscriptions.push(sessionManager);
  log('Chat Session Manager activated');

  // ─── 9. Primary Sidebar Webview (Kimi Code / Cursor style) ──────────────
  const sidebarWebviewProvider = new AGSidebarWebviewProvider(
    context.extensionUri,
    providerManager,
    sessionManager,
    toolRegistry,
    agentEngine,
    outputChannel
  );
  context.subscriptions.push(
    sidebarWebviewProvider,
    vscode.window.registerWebviewViewProvider(
      'ag-universal-ai.sidebarView',
      sidebarWebviewProvider
    )
  );
  log('Primary Sidebar Webview registered (Kimi/Cursor/Cline style)');

  // ─── 9b. Tree View Sidebar (Providers & Telemetry) ────────────────────
  const treeDataProvider = new AGTreeDataProvider(providerManager);
  context.subscriptions.push(
    treeDataProvider,
    vscode.window.registerTreeDataProvider('ag-universal-ai.treeView', treeDataProvider)
  );
  log('Tree View Sidebar registered (Providers & Telemetry)');

  // ─── 10. Status Bar ─────────────────────────────────────────────────────
  const statusBar = new AGStatusBar(providerManager);
  context.subscriptions.push(statusBar);
  statusBar.show();

  // ─── 11. Register Commands ──────────────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand('ag-universal-ai.switchProvider', () => {
      showProviderPicker(providerManager);
    }),

    vscode.commands.registerCommand('ag-universal-ai.switchModel', () => {
      showModelPicker(providerManager);
    }),

    vscode.commands.registerCommand('ag-universal-ai.setApiKey', () => {
      showApiKeyDialog(providerManager);
    }),

    vscode.commands.registerCommand('ag-universal-ai.checkHealth', () => {
      showHealthCheck(providerManager);
    }),

    vscode.commands.registerCommand('ag-universal-ai.showDashboard', () => {
      AGWebviewDashboard.show(context.extensionUri, providerManager);
    }),

    vscode.commands.registerCommand('ag-universal-ai.toggleInlineCompletion', () => {
      const config = vscode.workspace.getConfiguration('ag-universal-ai');
      const current = config.get<boolean>('inlineCompletion.enabled', true);
      config.update('inlineCompletion.enabled', !current, vscode.ConfigurationTarget.Global);
      vscode.window.showInformationMessage(
        `AG AI: Inline completion ${!current ? 'enabled ✅' : 'disabled ❌'}`
      );
    }),

    // Plan-Then-Act Agent Task Command
    vscode.commands.registerCommand('ag-universal-ai.runAgent', async () => {
      const goal = await vscode.window.showInputBox({
        prompt: 'What goal should the AG Agent accomplish?',
        placeHolder: 'e.g., "Refactor error handling and generate unit tests for this workspace"',
      });

      if (!goal) {return;}

      vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'AG AI Agent Planning...',
          cancellable: true,
        },
        async (progress, token) => {
          progress.report({ message: 'Generating execution plan...' });
          const plan = await agentPlanner.createPlan(goal);

          const planSummary = plan.steps
            .map((s) => `• Step ${s.id}: ${s.description}`)
            .join('\n');

          const action = await vscode.window.showInformationMessage(
            `Execution Plan Generated (${plan.steps.length} steps):\n${planSummary}`,
            { modal: true },
            'Execute Plan',
            'Cancel'
          );

          if (action !== 'Execute Plan') {
            return;
          }

          progress.report({ message: 'Running plan steps...' });
          const result = await agentEngine.run(
            `Goal: ${goal}\nPlan Strategy: ${plan.rationale}\nSteps:\n${planSummary}`,
            'You are AG Universal AI Agent. Execute the planned steps using your tools.',
            undefined,
            token
          );

          vscode.window.showInformationMessage(
            `AG Agent finished: ${result.iterations} iterations, ${result.toolCalls.length} tools executed`
          );
        }
      );
    }),

    // Reload External MCP Servers Command
    vscode.commands.registerCommand('ag-universal-ai.reloadMcpServers', async () => {
      await mcpClient.reloadServers();
      const statuses = mcpClient.getServerStatuses();
      const connected = statuses.filter((s) => s.status === 'connected').length;
      vscode.window.showInformationMessage(
        `AG AI: ${statuses.length} MCP server(s) configured (${connected} connected, ${toolRegistry.getToolDefinitions().length} total tools available).`
      );
    })
  );

  // ─── 12. Startup Summary ────────────────────────────────────────────────
  const activeProvider = providerManager.getActiveProvider();
  if (activeProvider) {
    log(`Active provider: ${activeProvider.name} (${activeProvider.config.model})`);
  }

  log('═════════════════════════════════════════════════════════');
  log('  AG Universal AI Extension Fully Activated! 🚀');
  log('  - Multi-Provider LLM Engine (11+ Backends)');
  log('  - Chat Participant @ag');
  log('  - Ghost Text Inline Completion');
  log('  - 7 Tool Declarations & MCP JSON-RPC Server');
  log('  - Plan-Then-Act Agentic Workflows');
  log('  - Activity Bar Sidebar & Webview Dashboard');
  log('═════════════════════════════════════════════════════════');
}

export function deactivate(): void {
  if (outputChannel) {
    outputChannel.appendLine('[AG Universal AI] Extension deactivated. Goodbye! 👋');
    outputChannel.dispose();
  }
}

function log(message: string): void {
  const timestamp = new Date().toISOString();
  outputChannel.appendLine(`[${timestamp}] [Extension] ${message}`);
}
