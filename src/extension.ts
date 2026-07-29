/**
 * AG Universal AI — Extension Entry Point
 *
 * Orchestrates the initialization and lifecycle of all extension components:
 * Provider System, Language Model Chat Provider, Inline Completion,
 * Chat Participant, Tool Registry, Agent Engine, UI, and Commands.
 */

import * as vscode from 'vscode';
import { ProviderManager } from './providers/provider-manager';
import { AGLanguageModelChatProvider } from './lm/chat-provider';
import { AGChatParticipant } from './chat/participant';
import { AGInlineCompletionProvider } from './completion/inline-provider';
import { ToolRegistry } from './tools/tool-registry';
import { AgentEngine } from './agent/engine';
import { AGStatusBar } from './ui/status-bar';
import {
  showProviderPicker,
  showModelPicker,
  showApiKeyDialog,
  showHealthCheck,
} from './ui/quick-pick';

let outputChannel: vscode.OutputChannel;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  // ─── 1. Output Channel ──────────────────────────────────────────────────
  outputChannel = vscode.window.createOutputChannel('AG Universal AI');
  context.subscriptions.push(outputChannel);
  log('Activating AG Universal AI extension...');

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
  log('Inline completion provider activated');

  // ─── 5. Tool Registry ──────────────────────────────────────────────────
  const toolRegistry = new ToolRegistry(outputChannel);
  context.subscriptions.push(toolRegistry);
  toolRegistry.register(context);
  log('Tool registry activated (7 tools registered)');

  // ─── 6. Agent Engine ───────────────────────────────────────────────────
  const agentEngine = new AgentEngine(providerManager, toolRegistry, outputChannel);
  context.subscriptions.push(agentEngine);
  log('Agent engine activated');

  // ─── 7. Chat Participant (@ag) ──────────────────────────────────────────
  const chatParticipant = new AGChatParticipant(lmProvider, providerManager, outputChannel);
  context.subscriptions.push(chatParticipant);
  chatParticipant.register();

  // ─── 8. Status Bar ──────────────────────────────────────────────────────
  const statusBar = new AGStatusBar(providerManager);
  context.subscriptions.push(statusBar);
  statusBar.show();

  // ─── 9. Register Commands ───────────────────────────────────────────────
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
      // Phase 3: Will open a Webview Panel with rich metrics dashboard
      const metrics = providerManager.getMetrics();
      const activeProvider = providerManager.getActiveProvider();

      if (metrics.length === 0) {
        vscode.window.showInformationMessage(
          `AG AI: ${activeProvider ? activeProvider.name : 'No provider'} active. ` +
          'No requests recorded yet. Start chatting with @ag!'
        );
        return;
      }

      const successCount = metrics.filter((m) => m.status === 'success').length;
      const avgLatency =
        metrics.reduce((sum, m) => sum + m.latencyMs, 0) / metrics.length;
      const totalTokens = metrics.reduce((sum, m) => sum + m.totalTokens, 0);

      vscode.window.showInformationMessage(
        `AG AI Dashboard: ${metrics.length} requests | ` +
        `${successCount} success | ` +
        `Avg ${Math.round(avgLatency)}ms | ` +
        `${totalTokens.toLocaleString()} total tokens`
      );
    }),

    vscode.commands.registerCommand('ag-universal-ai.toggleInlineCompletion', () => {
      const config = vscode.workspace.getConfiguration('ag-universal-ai');
      const current = config.get<boolean>('inlineCompletion.enabled', true);
      config.update('inlineCompletion.enabled', !current, vscode.ConfigurationTarget.Global);
      vscode.window.showInformationMessage(
        `AG AI: Inline completion ${!current ? 'enabled ✅' : 'disabled ❌'}`
      );
    }),

    // Agent mode command
    vscode.commands.registerCommand('ag-universal-ai.runAgent', async () => {
      const input = await vscode.window.showInputBox({
        prompt: 'What would you like the AG Agent to do?',
        placeHolder: 'e.g., "Add error handling to all functions in this file"',
      });

      if (!input) {return;}

      vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'AG AI Agent working...',
          cancellable: true,
        },
        async (_progress, token) => {
          const result = await agentEngine.run(
            input,
            'You are AG Universal AI, an agentic coding assistant. Use the available tools to complete the user\'s request. Read files, make changes, run commands as needed.',
            undefined,
            token
          );

          vscode.window.showInformationMessage(
            `AG Agent completed: ${result.iterations} iterations, ${result.toolCalls.length} tool calls`
          );
        }
      );
    })
  );

  // ─── 10. Welcome Message ───────────────────────────────────────────────
  const activeProvider = providerManager.getActiveProvider();
  if (activeProvider) {
    log(`Active provider: ${activeProvider.name} (${activeProvider.config.model})`);
  } else {
    log('No active provider configured.');
    const hasShownWelcome = context.globalState.get('ag-universal-ai.welcomeShown', false);
    if (!hasShownWelcome) {
      const action = await vscode.window.showInformationMessage(
        '🚀 Welcome to AG Universal AI! Configure an AI provider to get started.',
        'Set Up Provider',
        'Later'
      );
      if (action === 'Set Up Provider') {
        showProviderPicker(providerManager);
      }
      context.globalState.update('ag-universal-ai.welcomeShown', true);
    }
  }

  log('═══════════════════════════════════════════════════');
  log('  AG Universal AI extension activated successfully! 🚀');
  log('  Components: Provider Manager, LM Chat Provider,');
  log('  Inline Completion, Chat @ag, Tools (7),');
  log('  Agent Engine, Status Bar');
  log('═══════════════════════════════════════════════════');
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
