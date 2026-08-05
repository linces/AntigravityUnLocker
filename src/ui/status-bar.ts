/**
 * AG Universal AI — Status Bar
 *
 * Shows the active AI provider and model in the VS Code status bar.
 * Clicking switches providers via Quick Pick.
 */

import * as vscode from 'vscode';
import type { ProviderManager } from '../providers/provider-manager';

export class AGStatusBar implements vscode.Disposable {
  private statusBarItem: vscode.StatusBarItem;
  private disposables: vscode.Disposable[] = [];

  constructor(private readonly providerManager: ProviderManager) {
    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100
    );

    this.statusBarItem.command = 'ag-universal-ai.switchProvider';
    this.statusBarItem.tooltip = 'AG Universal AI — Click to switch provider';

    // Listen for provider changes
    this.disposables.push(
      this.providerManager.onDidChangeProvider(() => this.update())
    );

    // Listen for health changes
    this.disposables.push(
      this.providerManager.onDidChangeHealth(() => this.update())
    );
  }

  /**
   * Show the status bar item and update its content.
   */
  public show(): void {
    this.update();
    this.statusBarItem.show();
  }

  /**
   * Update the status bar content based on current state.
   */
  public update(): void {
    const provider = this.providerManager.getActiveProvider();

    if (!provider) {
      this.statusBarItem.text = '$(warning) AG AI: No Provider';
      this.statusBarItem.backgroundColor = new vscode.ThemeColor(
        'statusBarItem.warningBackground'
      );
      return;
    }

    // Determine status icon
    const icon = '$(robot)';

    // Truncate model name for display
    const modelName = this.truncateModel(provider.config.model);
    const providerLabel = this.getShortLabel(provider.id);

    this.statusBarItem.text = `${icon} AG AI: ${providerLabel} (${modelName})`;
    this.statusBarItem.backgroundColor = undefined;
    this.statusBarItem.tooltip = new vscode.MarkdownString(
      `**AG Universal AI**\n\n` +
      `- **Provider:** ${provider.name}\n` +
      `- **Model:** ${provider.config.model}\n` +
      `- **Endpoint:** ${provider.config.baseUrl}\n\n` +
      `Click to switch provider`
    );
  }

  // ─── Private Helpers ────────────────────────────────────────────────────────

  private getShortLabel(id: string): string {
    const shortNames: Record<string, string> = {
      'ollama-local': 'Ollama',
      'lmstudio-local': 'LM Studio',
      'openai': 'OpenAI',
      'groq': 'Groq',
      'openrouter': 'OpenRouter',
      'dashscope-qwen': 'Qwen',
      'moonshot-kimi': 'Kimi',
      'deepseek': 'DeepSeek',
      'siliconflow': 'SiliconFlow',
      'together-ai': 'Together',
      'fireworks-ai': 'Fireworks',
      'zai-glm': 'Z.ai',
      'custom': 'Custom',
    };
    return shortNames[id] || id;
  }

  private truncateModel(model: string): string {
    // Remove vendor prefix for display (e.g., "accounts/fireworks/models/qwen..." → "qwen...")
    const parts = model.split('/');
    const name = parts[parts.length - 1];
    return name.length > 24 ? name.substring(0, 21) + '...' : name;
  }

  public dispose(): void {
    this.statusBarItem.dispose();
    for (const d of this.disposables) {
      d.dispose();
    }
  }
}
