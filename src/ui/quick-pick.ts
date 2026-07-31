/**
 * AG Universal AI — Quick Pick Dialogs
 *
 * VS Code Quick Pick UI for provider/model selection and API key management.
 */

import * as vscode from 'vscode';
import type { ProviderManager } from '../providers/provider-manager';
import { getAllPresets } from '../providers/provider-registry';

/**
 * Show a Quick Pick to switch the active AI provider.
 */
export async function showProviderPicker(providerManager: ProviderManager): Promise<void> {
  const activeId = providerManager.getActiveProviderId();
  const presets = getAllPresets();

  const items: vscode.QuickPickItem[] = presets.map((preset) => ({
    label: preset.id === activeId ? `$(check) ${preset.name}` : `     ${preset.name}`,
    description: preset.isLocal ? '$(home) Local' : '$(cloud) Cloud',
    detail: preset.description,
    picked: preset.id === activeId,
    // Store the ID in a way we can retrieve it
    alwaysShow: true,
  }));

  // Add custom provider option
  items.push({
    label: activeId === 'custom' ? '$(check) Custom Provider' : '     Custom Provider',
    description: '$(gear) Custom endpoint',
    detail: 'Connect to any OpenAI-compatible API endpoint',
    alwaysShow: true,
  });

  const selected = await vscode.window.showQuickPick(items, {
    placeHolder: 'Select AI Provider',
    title: 'AG Universal AI — Switch Provider',
    matchOnDescription: true,
    matchOnDetail: true,
  });

  if (!selected) {return;}

  // Extract provider ID from label
  const label = selected.label.replace(/^\$\(check\)\s*/, '').replace(/^\s+/, '');

  let selectedId: string | undefined;
  if (label === 'Custom Provider') {
    selectedId = 'custom';
  } else {
    selectedId = presets.find((p) => p.name === label)?.id;
  }

  if (selectedId) {
    providerManager.setActiveProvider(selectedId);
    vscode.window.showInformationMessage(`AG AI: Switched to ${selected.label.replace(/\$\([^)]+\)\s*/, '').trim()}`);
  }
}

/**
 * Show a Quick Pick to select a specific model for the active provider.
 */
export async function showModelPicker(providerManager: ProviderManager): Promise<void> {
  const activeProvider = providerManager.getActiveProvider();
  if (!activeProvider) {
    vscode.window.showWarningMessage('AG AI: No active provider. Select a provider first.');
    return;
  }

  const quickPick = vscode.window.createQuickPick();
  quickPick.placeholder = 'Loading models...';
  quickPick.title = `AG Universal AI — Select Model (${activeProvider.name})`;
  quickPick.busy = true;
  quickPick.show();

  try {
    const models = activeProvider.listModels
      ? await activeProvider.listModels()
      : [];

    if (models.length === 0) {
      quickPick.items = [
        {
          label: activeProvider.config.model,
          description: '(default model)',
          detail: 'No model list available from this provider.',
        },
      ];
    } else {
      quickPick.items = models.map((m) => ({
        label: m.id,
        description: m.supportsVision ? '$(eye) Vision' : '',
        detail: `Max Input: ${m.maxInputTokens.toLocaleString()} tokens`,
      }));
    }

    quickPick.busy = false;
    quickPick.placeholder = 'Select a model';

    quickPick.onDidAccept(() => {
      const selected = quickPick.selectedItems[0];
      if (selected && activeProvider) {
        providerManager.setModel(activeProvider.id, selected.label);
        vscode.window.showInformationMessage(`AG AI: Model set to ${selected.label}`);
      }
      quickPick.dispose();
    });

    quickPick.onDidHide(() => quickPick.dispose());
  } catch (err: unknown) {
    quickPick.dispose();
    vscode.window.showErrorMessage(
      `AG AI: Failed to load models: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

/**
 * Show a dialog to set an API key for a provider.
 */
export async function showApiKeyDialog(providerManager: ProviderManager): Promise<void> {
  const presets = getAllPresets().filter((p) => p.requiresApiKey);

  const items: vscode.QuickPickItem[] = presets.map((preset) => ({
    label: preset.name,
    description: preset.keyProcurementUrl ? '$(link-external) Get key' : '',
    detail: preset.description,
  }));

  const selected = await vscode.window.showQuickPick(items, {
    placeHolder: 'Select provider to configure API key',
    title: 'AG Universal AI — Set API Key',
  });

  if (!selected) {return;}

  const preset = presets.find((p) => p.name === selected.label);
  if (!preset) {return;}

  // Check if user wants to get a key first
  if (preset.keyProcurementUrl) {
    const action = await vscode.window.showInformationMessage(
      `Get an API key for ${preset.name}?`,
      'Open Key Page',
      'I Have a Key'
    );

    if (action === 'Open Key Page') {
      vscode.env.openExternal(vscode.Uri.parse(preset.keyProcurementUrl));
    }
  }

  const apiKey = await vscode.window.showInputBox({
    prompt: `Enter API key for ${preset.name}`,
    placeHolder: 'sk-... or gsk_...',
    password: true,
    validateInput: (value) => {
      if (!value || value.trim().length === 0) {
        return 'API key cannot be empty';
      }
      return null;
    },
  });

  if (apiKey) {
    await providerManager.setApiKey(preset.id, apiKey.trim());
    vscode.window.showInformationMessage(`AG AI: API key saved for ${preset.name}`);
  }
}

/**
 * Show provider health check results.
 */
export async function showHealthCheck(providerManager: ProviderManager): Promise<void> {
  const progress = await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'AG AI: Checking provider health...',
      cancellable: false,
    },
    async () => {
      return providerManager.checkHealth();
    }
  );

  const lines: string[] = ['# AG Universal AI — Provider Health\n'];

  for (const [id, status] of progress) {
    const icon = status.isHealthy ? '✅' : '❌';
    const latency = status.latencyMs ? `${status.latencyMs}ms` : 'N/A';
    const error = status.error ? ` — ${status.error}` : '';
    lines.push(`${icon} **${id}** — ${latency}${error}`);
  }

  const doc = await vscode.workspace.openTextDocument({
    content: lines.join('\n'),
    language: 'markdown',
  });
  await vscode.window.showTextDocument(doc, { preview: true });
}
