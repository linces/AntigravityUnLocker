import { ILLMProvider, ChatCompletionRequest, ChatCompletionResponse } from '../adapters/base.js';
import { OpenAIAdapter } from '../adapters/openai.js';
import { OllamaAdapter } from '../adapters/ollama.js';
import fs from 'fs';

export interface ProviderDefinition {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs?: number;
}

export interface ProvidersConfig {
  default: string;
  fallback?: string[];
  providers: ProviderDefinition[];
}

export class ProviderRouter {
  private providers: Map<string, ILLMProvider> = new Map();
  private defaultConfig: ProvidersConfig;
  private activeProviderId: string;

  constructor(configPath: string) {
    const raw = fs.readFileSync(configPath, 'utf-8');
    this.defaultConfig = JSON.parse(raw);
    this.activeProviderId = this.defaultConfig.default;
    this.initializeProviders();
  }

  private initializeProviders(): void {
    for (const p of this.defaultConfig.providers) {
      const apiKeyResolved = p.apiKey.replace(/\$\{([^}]+)\}/g, (_, key) => process.env[key] || '');
      
      let instance: ILLMProvider;
      if (p.baseUrl.includes('localhost:11434') || p.baseUrl.includes('127.0.0.1:11434')) {
        instance = new OllamaAdapter({ ...p, apiKey: apiKeyResolved });
      } else {
        instance = new OpenAIAdapter({ ...p, apiKey: apiKeyResolved });
      }

      this.providers.set(p.id, instance);
    }
  }

  public setActiveProvider(id: string): void {
    if (!this.providers.has(id)) {
      throw new Error(`Provider '${id}' is not configured.`);
    }
    this.activeProviderId = id;
    console.log(`[ag-provider] Active provider switched to '${id}'`);
  }

  public getActiveProviderId(): string {
    return this.activeProviderId;
  }

  public getProvider(id?: string): ILLMProvider {
    const targetId = id || this.activeProviderId;
    const provider = this.providers.get(targetId);
    if (!provider) {
      throw new Error(`Provider '${targetId}' not registered in ag-provider config.`);
    }
    return provider;
  }

  public async chatWithFallback(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    const primaryId = this.activeProviderId;
    const fallbacks = (this.defaultConfig.fallback || []).filter(f => f !== primaryId);
    const targets = [primaryId, ...fallbacks];

    let lastError: any;
    for (const providerId of targets) {
      try {
        const provider = this.getProvider(providerId);
        console.log(`[ag-provider] Routing request to provider '${provider.name}' (${provider.id})`);
        return await provider.chat(request);
      } catch (err: any) {
        console.warn(`[ag-provider] Provider '${providerId}' failed: ${err.message}. Trying fallback...`);
        lastError = err;
      }
    }

    throw new Error(`All providers failed. Last error: ${lastError?.message}`);
  }
}
