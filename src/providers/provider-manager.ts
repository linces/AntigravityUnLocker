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
import * as fs from 'fs';
import * as path from 'path';
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

/**
 * Maps provider IDs to environment variable names in .env file.
 */
const ENV_KEY_MAP: Record<string, string> = {
  'openai': 'OPENAI_API_KEY',
  'groq': 'GROQ_API_KEY',
  'openrouter': 'OPENROUTER_API_KEY',
  'dashscope-qwen': 'DASHSCOPE_API_KEY',
  'moonshot-kimi': 'KIMI_API_KEY',
  'deepseek': 'DEEPSEEK_API_KEY',
  'siliconflow': 'SILICONFLOW_API_KEY',
  'together-ai': 'TOGETHER_API_KEY',
  'fireworks-ai': 'FIREWORKS_API_KEY',
  'nvidia': 'NVIDIA_API_KEY',
  'zai-glm': 'ZAI_API_KEY',
  'custom': 'CUSTOM_API_KEY',
};

export class ProviderManager implements vscode.Disposable {
  private providers = new Map<string, ILLMProvider>();
  private activeProviderId: string | undefined;
  private secretStorage: vscode.SecretStorage;
  private outputChannel: vscode.OutputChannel;
  private disposables: vscode.Disposable[] = [];
  private metrics: RequestMetric[] = [];
  private envKeys = new Map<string, string>();

  private isUpdatingConfig = false;
  private lastConfigUpdateTime = 0;

  private readonly _onDidChangeProvider = new vscode.EventEmitter<ProviderChangeEvent>();
  public readonly onDidChangeProvider = this._onDidChangeProvider.event;

  private readonly _onDidChangeHealth = new vscode.EventEmitter<{ id: string; status: HealthStatus }>();
  public readonly onDidChangeHealth = this._onDidChangeHealth.event;

  private readonly _onDidChangeMetrics = new vscode.EventEmitter<RequestMetric>();
  public readonly onDidChangeMetrics = this._onDidChangeMetrics.event;

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

    // Bootstrap: load API keys from .env file if present
    this.loadEnvFile();

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
      await this.setActiveProvider(activeId);
    } else if (this.providers.size > 0) {
      const firstId = this.providers.keys().next().value as string;
      await this.setActiveProvider(firstId);
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
  /**
   * Set the active provider by ID.
   */
  public async setActiveProvider(id: string): Promise<void> {
    const provider = this.providers.get(id);
    if (!provider) {
      this.log(`Provider "${id}" not found. Available: ${[...this.providers.keys()].join(', ')}`);
      return;
    }

    const previousId = this.activeProviderId;
    this.activeProviderId = id;

    // Check for saved model preference for this provider or fallback to preset default
    const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
    const userOverrides = config.get<Record<string, { model?: string }>>('providers', {});
    const savedModel = userOverrides[id]?.model;
    if (savedModel) {
      if (provider instanceof OpenAIAdapter) {
        provider.updateModel(savedModel);
      } else {
        provider.config.model = savedModel;
      }
    } else {
      const preset = getPreset(id);
      if (preset?.defaultModel) {
        if (provider instanceof OpenAIAdapter) {
          provider.updateModel(preset.defaultModel);
        } else {
          provider.config.model = preset.defaultModel;
        }
      }
    }

    this.isUpdatingConfig = true;
    this.lastConfigUpdateTime = Date.now();
    try {
      await config.update('activeProvider', id, vscode.ConfigurationTarget.Global);
      await config.update('activeModel', provider.config.model, vscode.ConfigurationTarget.Global);
    } catch (err) {
      this.log(`Error persisting active provider settings: ${err}`);
    } finally {
      setTimeout(() => {
        this.isUpdatingConfig = false;
      }, 500);
    }

    this._onDidChangeProvider.fire({
      previousId,
      newId: id,
      provider,
    });

    this.log(`Active provider switched: ${previousId} → ${id} (${provider.name}, model: ${provider.config.model})`);
  }

  /**
   * Set active model for a provider and persist settings.
   */
  public async setModel(providerId: string, model: string): Promise<void> {
    const provider = this.providers.get(providerId);
    if (!provider) {
      this.log(`Provider "${providerId}" not found for setting model.`);
      return;
    }

    if (provider instanceof OpenAIAdapter) {
      provider.updateModel(model);
    } else {
      provider.config.model = model;
    }

    this.isUpdatingConfig = true;
    this.lastConfigUpdateTime = Date.now();
    try {
      const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
      if (providerId === this.activeProviderId) {
        await config.update('activeModel', model, vscode.ConfigurationTarget.Global);
      }

      const userOverrides = config.get<Record<string, { baseUrl?: string; model?: string; timeoutMs?: number }>>(
        'providers',
        {}
      );
      const currentOverride = userOverrides[providerId] || {};
      await config.update(
        'providers',
        {
          ...userOverrides,
          [providerId]: { ...currentOverride, model },
        },
        vscode.ConfigurationTarget.Global
      );
    } catch (err) {
      this.log(`Error persisting model settings: ${err}`);
    } finally {
      setTimeout(() => {
        this.isUpdatingConfig = false;
      }, 500);
    }

    this._onDidChangeProvider.fire({
      previousId: this.activeProviderId,
      newId: providerId,
      provider,
    });

    this.log(`Model for provider "${providerId}" updated to: ${model}`);
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
      this.recordMetric({
        providerId: active.id,
        model: response.model || request.model,
        isStream: false,
        promptTokens: response.usage?.prompt_tokens || 0,
        completionTokens: response.usage?.completion_tokens || 0,
        latencyMs: Date.now() - startTime,
        status: 'success',
      });
      return response;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.log(`Primary provider "${active.id}" failed: ${msg}`);
      this.recordMetric({
        providerId: active.id,
        model: request.model,
        isStream: false,
        promptTokens: 0,
        completionTokens: 0,
        latencyMs: 0,
        status: 'error',
        errorMessage: msg,
      });
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
        this.recordMetric({
          providerId: fallback.id,
          model: response.model || request.model,
          isStream: false,
          promptTokens: response.usage?.prompt_tokens || 0,
          completionTokens: response.usage?.completion_tokens || 0,
          latencyMs: Date.now() - startTime,
          status: 'success',
        });
        return response;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.log(`Fallback provider "${fallback.id}" also failed: ${msg}`);
        this.recordMetric({
          providerId: fallback.id,
          model: request.model,
          isStream: false,
          promptTokens: 0,
          completionTokens: 0,
          latencyMs: 0,
          status: 'error',
          errorMessage: msg,
        });
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
    if (!provider || !provider.listModels) { return []; }
    try {
      return await Promise.race([
        provider.listModels(),
        new Promise<ModelInfo[]>((_, reject) =>
          setTimeout(() => reject(new Error('Timeout listing models')), 3000)
        ),
      ]);
    } catch {
      return [];
    }
  }

  /**
   * Get recorded metrics.
   */
  public getMetrics(): readonly RequestMetric[] {
    return this.metrics;
  }

  // ─── Private Methods ────────────────────────────────────────────────────────

  private async initializeProvider(preset: ProviderPreset): Promise<void> {
    // Resolution order: SecretStorage → .env file → empty
    let apiKey: string | undefined;
    if (preset.requiresApiKey) {
      apiKey = await this.getApiKey(preset.id);
      if (!apiKey) {
        apiKey = this.getEnvKey(preset.id);
        if (apiKey) {
          this.log(`[${preset.id}] API key loaded from .env file`);
          // Migrate to SecretStorage for next time
          await this.setApiKey(preset.id, apiKey);
        }
      }
    }

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
    if (this.isUpdatingConfig || Date.now() - this.lastConfigUpdateTime < 500) {
      return;
    }
    const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
    const newActiveId = config.get<string>('activeProvider', 'ollama-local');
    const userOverrides = config.get<Record<string, { baseUrl?: string; model?: string; timeoutMs?: number }>>(
      'providers',
      {}
    );

    let changed = false;
    const previousId = this.activeProviderId;

    // 1. Sync provider model overrides
    for (const [pId, p] of this.providers.entries()) {
      const overrideModel = userOverrides[pId]?.model;
      if (overrideModel && overrideModel !== p.config.model) {
        if (p instanceof OpenAIAdapter) {
          p.updateModel(overrideModel);
        } else {
          p.config.model = overrideModel;
        }
        changed = true;
      }
    }

    // 2. Check active provider change
    if (newActiveId !== this.activeProviderId && this.providers.has(newActiveId)) {
      this.activeProviderId = newActiveId;
      changed = true;
      // Ensure model for newly active provider is correctly populated
      const activeP = this.providers.get(newActiveId);
      if (activeP) {
        const overrideModel = userOverrides[newActiveId]?.model;
        const preset = getPreset(newActiveId);
        const targetModel = overrideModel || preset?.defaultModel || activeP.config.model;
        if (activeP instanceof OpenAIAdapter) {
          activeP.updateModel(targetModel);
        } else {
          activeP.config.model = targetModel;
        }
      }
    }

    const activeProv = this.getActiveProvider();

    if (changed && activeProv) {
      this._onDidChangeProvider.fire({
        previousId,
        newId: this.activeProviderId || newActiveId,
        provider: activeProv,
      });
    }
  }

  /**
   * Record telemetry metric for a request.
   */
  public recordMetric(data: {
    providerId: string;
    model: string;
    isStream: boolean;
    promptTokens: number;
    completionTokens: number;
    latencyMs: number;
    status: 'success' | 'error';
    errorMessage?: string;
  }): void {
    const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
    if (!config.get<boolean>('telemetry.enabled', true)) {return;}

    const metric: RequestMetric = {
      id: `req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      timestamp: new Date().toISOString(),
      providerId: data.providerId,
      model: data.model,
      isStream: data.isStream,
      promptTokens: data.promptTokens,
      completionTokens: data.completionTokens,
      totalTokens: data.promptTokens + data.completionTokens,
      latencyMs: data.latencyMs,
      status: data.status,
      errorMessage: data.errorMessage,
    };

    this.metrics.push(metric);

    // Keep only last 1000 metrics
    if (this.metrics.length > 1000) {
      this.metrics = this.metrics.slice(-1000);
    }

    this._onDidChangeMetrics.fire(metric);
  }

  /**
   * Clear all recorded metrics.
   */
  public clearMetrics(): void {
    this.metrics = [];
    this._onDidChangeMetrics.fire({
      id: 'clear',
      timestamp: new Date().toISOString(),
      providerId: 'system',
      model: 'system',
      isStream: false,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      latencyMs: 0,
      status: 'success',
    });
  }

  private log(message: string): void {
    const timestamp = new Date().toISOString();
    this.outputChannel.appendLine(`[${timestamp}] [ProviderManager] ${message}`);
  }

  /**
   * Load API keys from .env file in the workspace root.
   * This serves as a bootstrap mechanism for first-time setup.
   * Keys are migrated to SecretStorage on first load.
   */
  private loadEnvFile(): void {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      return;
    }

    const envPath = path.join(workspaceFolders[0].uri.fsPath, '.env');
    if (!fs.existsSync(envPath)) {
      // Also try extension install path
      const extEnvPath = path.join(this.context.extensionPath, '.env');
      if (!fs.existsSync(extEnvPath)) {
        return;
      }
      this.parseEnvFile(extEnvPath);
      return;
    }

    this.parseEnvFile(envPath);
  }

  private parseEnvFile(envPath: string): void {
    try {
      const content = fs.readFileSync(envPath, 'utf-8');
      let count = 0;
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) {continue;}
        const idx = trimmed.indexOf('=');
        if (idx <= 0) {continue;}

        const key = trimmed.slice(0, idx).trim();
        let val = trimmed.slice(idx + 1).trim();
        // Strip quotes
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }

        if (val.length > 0) {
          this.envKeys.set(key, val);
          count++;
        }
      }
      this.log(`.env file loaded: ${count} keys found`);
    } catch (err: unknown) {
      this.log(`.env file error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * Get an API key for a provider from the .env file.
   */
  private getEnvKey(providerId: string): string | undefined {
    const envVarName = ENV_KEY_MAP[providerId];
    if (!envVarName) {return undefined;}
    return this.envKeys.get(envVarName);
  }

  public dispose(): void {
    this._onDidChangeProvider.dispose();
    this._onDidChangeHealth.dispose();
    this._onDidChangeMetrics.dispose();
    for (const d of this.disposables) {
      d.dispose();
    }
  }
}
