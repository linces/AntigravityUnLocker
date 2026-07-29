/**
 * AG Universal AI — Extension Entry Point
 *
 * Orchestrates the initialization and lifecycle of all extension components:
 * Provider System, Language Model Chat Provider, Chat Participant, UI, and Commands.
 */

import * as vscode from 'vscode';
import { ProviderManager } from './providers/provider-manager';
import { AGLanguageModelChatProvider } from './lm/chat-provider';
import { AGChatParticipant } from './chat/participant';
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

  // ─── 4. Chat Participant (@ag) ──────────────────────────────────────────
  const chatParticipant = new AGChatParticipant(lmProvider, providerManager, outputChannel);
  context.subscriptions.push(chatParticipant);
  chatParticipant.register();

  // ─── 5. Status Bar ──────────────────────────────────────────────────────
  const statusBar = new AGStatusBar(providerManager);
  context.subscriptions.push(statusBar);
  statusBar.show();

  // ─── 6. Register Commands ───────────────────────────────────────────────
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
      vscode.window.showInformationMessage(
        'AG AI Dashboard will be available in a future update. ' +
        'Use "AG AI: Check Provider Health" for current status.'
      );
    }),

    vscode.commands.registerCommand('ag-universal-ai.toggleInlineCompletion', () => {
      const config = vscode.workspace.getConfiguration('ag-universal-ai');
      const current = config.get<boolean>('inlineCompletion.enabled', true);
      config.update('inlineCompletion.enabled', !current, vscode.ConfigurationTarget.Global);
      vscode.window.showInformationMessage(
        `AG AI: Inline completion ${!current ? 'enabled' : 'disabled'}`
      );
    })
  );

  // ─── 7. Welcome Message ────────────────────────────────────────────────
  const activeProvider = providerManager.getActiveProvider();
  if (activeProvider) {
    log(`Active provider: ${activeProvider.name} (${activeProvider.config.model})`);
  } else {
    log('No active provider configured. Use the command palette to set one up.');
    // Show a gentle notification on first activation
    const hasShownWelcome = context.globalState.get('ag-universal-ai.welcomeShown', false);
    if (!hasShownWelcome) {
      const action = await vscode.window.showInformationMessage(
        'Welcome to AG Universal AI! Configure an AI provider to get started.',
        'Set Up Provider',
        'Later'
      );
      if (action === 'Set Up Provider') {
        showProviderPicker(providerManager);
      }
      context.globalState.update('ag-universal-ai.welcomeShown', true);
    }
  }

  log('AG Universal AI extension activated successfully! 🚀');
}

export function deactivate(): void {
  if (outputChannel) {
    outputChannel.appendLine('[AG Universal AI] Extension deactivated.');
    outputChannel.dispose();
  }
}

function log(message: string): void {
  const timestamp = new Date().toISOString();
  outputChannel.appendLine(`[${timestamp}] [Extension] ${message}`);
}
