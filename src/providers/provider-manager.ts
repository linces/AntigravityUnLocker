/**
 * AG Universal AI — Provider Manager
 *
 * Central orchestration of AI provider lifecycle:
 * - Loads provider configurations from VS Code settings
 * - Resolves API keys from VS Code SecretStorage
 * - Manages active provider selection and fallback
 * - Emits events on provider changes
 * - Performs health checks
 */

import * as vscode from 'vscode';
import { OpenAIAdapter } from './openai-adapter';
import { OllamaAdapter } from './ollama-adapter';
import { getPreset, getAllPresets, type ProviderPreset } from './provider-registry';
import type {
  ILLMProvider,
  ProviderConfig,
  ProviderChangeEvent,
  ChatCompletionRequest,
  ChatCompletionResponse,
  HealthStatus,
  ModelInfo,
  RequestMetric,
} from './types';

const CONFIG_SECTION = 'ag-universal-ai';
const SECRET_KEY_PREFIX = 'ag-universal-ai.apiKey.';

export class ProviderManager implements vscode.Disposable {
  private providers = new Map<string, ILLMProvider>();
  private activeProviderId: string | undefined;
  private secretStorage: vscode.SecretStorage;
  private outputChannel: vscode.OutputChannel;
  private disposables: vscode.Disposable[] = [];
  private metrics: RequestMetric[] = [];

  private readonly _onDidChangeProvider = new vscode.EventEmitter<ProviderChangeEvent>();
  public readonly onDidChangeProvider = this._onDidChangeProvider.event;

  private readonly _onDidChangeHealth = new vscode.EventEmitter<{ id: string; status: HealthStatus }>();
  public readonly onDidChangeHealth = this._onDidChangeHealth.event;

  constructor(
    private readonly context: vscode.ExtensionContext,
    outputChannel: vscode.OutputChannel
  ) {
    this.secretStorage = context.secrets;
    this.outputChannel = outputChannel;

    // Listen for configuration changes
    this.disposables.push(
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration(CONFIG_SECTION)) {
          this.handleConfigChange();
        }
      })
    );
  }

  /**
   * Initialize the provider manager — load all providers and activate the default.
   */
  public async initialize(): Promise<void> {
    this.log('Initializing Provider Manager...');

    // Initialize providers from presets
    for (const preset of getAllPresets()) {
      await this.initializeProvider(preset);
    }

    // Initialize custom provider if configured
    await this.initializeCustomProvider();

    // Activate the configured default provider
    const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
    const activeId = config.get<string>('activeProvider', 'ollama-local');

    if (this.providers.has(activeId)) {
      this.setActiveProvider(activeId);
    } else if (this.providers.size > 0) {
      const firstId = this.providers.keys().next().value as string;
      this.setActiveProvider(firstId);
    }

    this.log(`Provider Manager initialized. ${this.providers.size} providers loaded. Active: ${this.activeProviderId}`);
  }

  /**
   * Get the currently active provider.
   */
  public getActiveProvider(): ILLMProvider | undefined {
    if (!this.activeProviderId) {return undefined;}
    return this.providers.get(this.activeProviderId);
  }

  /**
   * Get the active provider ID.
   */
  public getActiveProviderId(): string | undefined {
    return this.activeProviderId;
  }

  /**
   * Set the active provider by ID.
   */
  public setActiveProvider(id: string): void {
    const provider = this.providers.get(id);
    if (!provider) {
      this.log(`Provider "${id}" not found. Available: ${[...this.providers.keys()].join(', ')}`);
      return;
    }

    const previousId = this.activeProviderId;
    this.activeProviderId = id;

    // Persist to settings
    const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
    config.update('activeProvider', id, vscode.ConfigurationTarget.Global);

    this._onDidChangeProvider.fire({
      previousId,
      newId: id,
      provider,
    });

    this.log(`Active provider switched: ${previousId} → ${id} (${provider.name})`);
  }

  /**
   * Get a specific provider by ID.
   */
  public getProvider(id: string): ILLMProvider | undefined {
    return this.providers.get(id);
  }

  /**
   * Get all registered providers.
   */
  public getAllProviders(): Map<string, ILLMProvider> {
    return new Map(this.providers);
  }

  /**
   * Get all provider IDs.
   */
  public getProviderIds(): string[] {
    return [...this.providers.keys()];
  }

  /**
   * Store an API key securely in VS Code SecretStorage.
   */
  public async setApiKey(providerId: string, apiKey: string): Promise<void> {
    await this.secretStorage.store(`${SECRET_KEY_PREFIX}${providerId}`, apiKey);
    this.log(`API key stored for provider: ${providerId}`);

    // Update the existing provider instance
    const provider = this.providers.get(providerId);
    if (provider && provider instanceof OpenAIAdapter) {
      provider.updateApiKey(apiKey);
    }
  }

  /**
   * Get an API key from SecretStorage.
   */
  public async getApiKey(providerId: string): Promise<string | undefined> {
    return this.secretStorage.get(`${SECRET_KEY_PREFIX}${providerId}`);
  }

  /**
   * Chat with fallback: try active provider, then fallback chain.
   */
  public async chatWithFallback(
    request: ChatCompletionRequest
  ): Promise<ChatCompletionResponse> {
    const active = this.getActiveProvider();
    if (!active) {
      throw new Error('No active AI provider configured. Use the command palette to select one.');
    }

    // Try active provider
    try {
      const startTime = Date.now();
      const response = await active.chat(request);
      this.recordMetric(active, request, response, Date.now() - startTime, 'success');
      return response;
    } catch (err: unknown) {
      this.log(`Primary provider "${active.id}" failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    // Try fallback providers
    const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
    const fallbackIds = config.get<string[]>('fallbackProviders', []);

    for (const fallbackId of fallbackIds) {
      if (fallbackId === this.activeProviderId) {continue;}
      const fallback = this.providers.get(fallbackId);
      if (!fallback) {continue;}

      try {
        this.log(`Trying fallback provider: ${fallback.name}`);
        const startTime = Date.now();
        const response = await fallback.chat(request);
        this.recordMetric(fallback, request, response, Date.now() - startTime, 'success');
        return response;
      } catch (err: unknown) {
        this.log(`Fallback provider "${fallback.id}" also failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    throw new Error('All AI providers failed. Check your configuration and API keys.');
  }

  /**
   * Check health of a specific provider or all providers.
   */
  public async checkHealth(providerId?: string): Promise<Map<string, HealthStatus>> {
    const results = new Map<string, HealthStatus>();

    const targetProviders = providerId
      ? [[providerId, this.providers.get(providerId)] as const]
      : [...this.providers.entries()];

    for (const [id, provider] of targetProviders) {
      if (!provider) {continue;}
      const status = await provider.health();
      results.set(id, status);
      this._onDidChangeHealth.fire({ id, status });
    }

    return results;
  }

  /**
   * List available models for a provider.
   */
  public async listModels(providerId: string): Promise<ModelInfo[]> {
    const provider = this.providers.get(providerId);
    if (!provider) {return [];}
    if (provider.listModels) {
      return provider.listModels();
    }
    return [];
  }

  /**
   * Get recorded metrics.
   */
  public getMetrics(): readonly RequestMetric[] {
    return this.metrics;
  }

  // ─── Private Methods ────────────────────────────────────────────────────────

  private async initializeProvider(preset: ProviderPreset): Promise<void> {
    const apiKey = preset.requiresApiKey
      ? await this.getApiKey(preset.id)
      : undefined;

    const providerConfig: ProviderConfig = {
      id: preset.id,
      name: preset.name,
      baseUrl: preset.baseUrl,
      model: preset.model,
      timeoutMs: preset.timeoutMs,
      apiKey: apiKey || '',
    };

    // Apply user overrides from settings
    const userOverrides = vscode.workspace
      .getConfiguration(CONFIG_SECTION)
      .get<Record<string, { baseUrl?: string; model?: string; timeoutMs?: number }>>(
        'providers',
        {}
      );

    const override = userOverrides[preset.id];
    if (override) {
      if (override.baseUrl) {providerConfig.baseUrl = override.baseUrl;}
      if (override.model) {providerConfig.model = override.model;}
      if (override.timeoutMs) {providerConfig.timeoutMs = override.timeoutMs;}
    }

    // Create the appropriate adapter
    const provider =
      preset.id === 'ollama-local'
        ? new OllamaAdapter(providerConfig)
        : new OpenAIAdapter(providerConfig);

    this.providers.set(preset.id, provider);
  }

  private async initializeCustomProvider(): Promise<void> {
    const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
    const custom = config.get<{ baseUrl: string; model: string }>('customProvider', {
      baseUrl: '',
      model: '',
    });

    if (!custom.baseUrl) {return;}

    const apiKey = await this.getApiKey('custom');

    const provider = new OpenAIAdapter({
      id: 'custom',
      name: 'Custom Provider',
      baseUrl: custom.baseUrl,
      model: custom.model || 'default',
      timeoutMs: 60000,
      apiKey: apiKey || '',
    });

    this.providers.set('custom', provider);
    this.log(`Custom provider initialized: ${custom.baseUrl}`);
  }

  private handleConfigChange(): void {
    // Re-read active provider
    const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
    const newActiveId = config.get<string>('activeProvider', 'ollama-local');

    if (newActiveId !== this.activeProviderId && this.providers.has(newActiveId)) {
      this.setActiveProvider(newActiveId);
    }
  }

  private recordMetric(
    provider: ILLMProvider,
    request: ChatCompletionRequest,
    response: ChatCompletionResponse,
    latencyMs: number,
    status: 'success' | 'error'
  ): void {
    const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
    if (!config.get<boolean>('telemetry.enabled', true)) {return;}

    const metric: RequestMetric = {
      id: `req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      timestamp: new Date().toISOString(),
      providerId: provider.id,
      model: response.model || request.model,
      isStream: request.stream || false,
      promptTokens: response.usage?.prompt_tokens || 0,
      completionTokens: response.usage?.completion_tokens || 0,
      totalTokens: response.usage?.total_tokens || 0,
      latencyMs,
      status,
    };

    this.metrics.push(metric);

    // Keep only last 1000 metrics
    if (this.metrics.length > 1000) {
      this.metrics = this.metrics.slice(-1000);
    }
  }

  private log(message: string): void {
    const timestamp = new Date().toISOString();
    this.outputChannel.appendLine(`[${timestamp}] [ProviderManager] ${message}`);
  }

  public dispose(): void {
    this._onDidChangeProvider.dispose();
    this._onDidChangeHealth.dispose();
    for (const d of this.disposables) {
      d.dispose();
    }
  }
}
