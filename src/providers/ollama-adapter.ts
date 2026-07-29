/**
 * AG Universal AI — Ollama-Specific Adapter
 *
 * Extends the OpenAI adapter with Ollama-specific features:
 * - Auto-discovery of local models via /api/tags
 * - Health check via /api/tags instead of /models
 * - Default to localhost:11434
 */

import { OpenAIAdapter } from './openai-adapter';
import type { ProviderConfig, HealthStatus, ModelInfo } from './types';

export class OllamaAdapter extends OpenAIAdapter {
  private ollamaBaseUrl: string;

  constructor(config: ProviderConfig) {
    // Ollama's OpenAI-compatible endpoint is at /v1
    const adjustedConfig = {
      ...config,
      baseUrl: config.baseUrl.includes('/v1')
        ? config.baseUrl
        : `${config.baseUrl.replace(/\/$/, '')}/v1`,
      apiKey: config.apiKey || 'ollama', // Ollama doesn't need a key but some clients require one
    };
    super(adjustedConfig);
    this.ollamaBaseUrl = config.baseUrl.replace(/\/v1\/?$/, '').replace(/\/$/, '');
  }

  public override async health(): Promise<HealthStatus> {
    const start = Date.now();
    try {
      const response = await fetch(`${this.ollamaBaseUrl}/api/tags`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });

      return {
        isHealthy: response.ok,
        latencyMs: Date.now() - start,
        lastChecked: new Date(),
      };
    } catch (err: unknown) {
      return {
        isHealthy: false,
        latencyMs: Date.now() - start,
        error: err instanceof Error ? err.message : String(err),
        lastChecked: new Date(),
      };
    }
  }

  public override async listModels(): Promise<ModelInfo[]> {
    try {
      const response = await fetch(`${this.ollamaBaseUrl}/api/tags`, {
        method: 'GET',
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        return [];
      }

      const data = (await response.json()) as {
        models?: Array<{
          name: string;
          size: number;
          details?: { parameter_size?: string; family?: string };
        }>;
      };

      if (!data.models || !Array.isArray(data.models)) {
        return [];
      }

      return data.models.map((m) => ({
        id: m.name,
        name: m.name,
        vendor: 'ollama',
        maxInputTokens: 128000,
        maxOutputTokens: 4096,
        supportsTools: true,
        supportsVision: m.name.includes('llava') || m.name.includes('vision'),
      }));
    } catch {
      return [];
    }
  }
}
