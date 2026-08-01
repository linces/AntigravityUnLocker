/**
 * AG Universal AI — OpenAI-Compatible Provider Adapter
 *
 * Universal adapter that works with any OpenAI API-compatible endpoint:
 * OpenAI, Ollama, Groq, OpenRouter, DashScope, Kimi, DeepSeek, LM Studio,
 * vLLM, SiliconFlow, Together AI, Fireworks AI, and more.
 */

import type {
  ILLMProvider,
  ProviderConfig,
  ProviderCapabilities,
  ChatCompletionRequest,
  ChatCompletionResponse,
  HealthStatus,
  ModelInfo,
} from './types';

export class OpenAIAdapter implements ILLMProvider {
  public readonly id: string;
  public readonly name: string;
  public readonly config: ProviderConfig;

  private baseUrl: string;
  private apiKey: string;
  private model: string;
  private timeoutMs: number;

  constructor(config: ProviderConfig) {
    this.id = config.id;
    this.name = config.name;
    this.config = config;
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.apiKey = config.apiKey || '';
    this.model = config.model;
    this.timeoutMs = config.timeoutMs || 60000;
  }

  public updateApiKey(apiKey: string): void {
    this.apiKey = apiKey;
    this.config.apiKey = apiKey;
  }

  public updateModel(model: string): void {
    this.model = model;
    this.config.model = model;
  }

  public capabilities(): ProviderCapabilities {
    return {
      supportsStreaming: true,
      supportsTools: true,
      supportsVision: true,
      maxContextTokens: 128000,
    };
  }

  public async chat(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    const url = `${this.baseUrl}/chat/completions`;
    const payload = this.buildPayload(request, false);

    let lastError: Error | undefined;
    const maxRetries = 2;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (attempt > 0) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);

      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: this.buildHeaders(),
          body: JSON.stringify(payload),
          signal: controller.signal,
        });

        if (!response.ok) {
          const errorText = await response.text();
          const isTransient = [429, 502, 503, 504].includes(response.status);
          const err = new Error(`HTTP ${response.status}: ${errorText}`);
          if (isTransient && attempt < maxRetries) {
            lastError = err;
            continue;
          }
          throw err;
        }

        return (await response.json()) as ChatCompletionResponse;
      } catch (err: unknown) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt < maxRetries && lastError.message.includes('fetch failed')) {
          continue;
        }
        throw lastError;
      } finally {
        clearTimeout(timer);
      }
    }

    throw lastError || new Error('Request failed after retries.');
  }

  public async *stream(
    request: ChatCompletionRequest,
    signal?: AbortSignal
  ): AsyncIterable<string> {
    const url = `${this.baseUrl}/chat/completions`;
    const payload = this.buildPayload(request, true);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    const abortHandler = () => controller.abort();
    if (signal) {
      signal.addEventListener('abort', abortHandler);
    }

    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: this.buildHeaders(),
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        let errorText = 'No response body';
        try {
          errorText = await response.text();
        } catch {
          // ignore
        }
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      reader = (response.body as ReadableStream<Uint8Array>).getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) {break;}

        // Clear connection timeout once data starts streaming
        clearTimeout(timer);

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('data: ')) {
            const dataStr = trimmed.slice(6);
            if (dataStr === '[DONE]') {return;}
            try {
              const parsed = JSON.parse(dataStr);
              const delta = parsed.choices?.[0]?.delta?.content;
              if (delta) {yield delta;}
            } catch {
              // Skip malformed chunks
            }
          }
        }
      }
    } finally {
      clearTimeout(timer);
      if (signal) {
        signal.removeEventListener('abort', abortHandler);
      }
      if (reader) {
        try {
          reader.releaseLock();
        } catch {
          // ignore
        }
      }
    }
  }

  public async health(): Promise<HealthStatus> {
    const start = Date.now();
    try {
      // Try /models endpoint first (standard OpenAI), fall back to a minimal chat
      const response = await fetch(`${this.baseUrl}/models`, {
        method: 'GET',
        headers: this.buildHeaders(),
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

  public async listModels(): Promise<ModelInfo[]> {
    try {
      const response = await fetch(`${this.baseUrl}/models`, {
        method: 'GET',
        headers: this.buildHeaders(),
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        return [this.defaultModelInfo()];
      }

      const data = (await response.json()) as { data?: Array<{ id: string }> };
      if (!data.data || !Array.isArray(data.data)) {
        return [this.defaultModelInfo()];
      }

      return data.data.map((m) => ({
        id: m.id,
        name: m.id,
        vendor: this.id,
        maxInputTokens: 128000,
        maxOutputTokens: 4096,
        supportsTools: true,
        supportsVision: false,
      }));
    } catch {
      return [this.defaultModelInfo()];
    }
  }

  // ─── Private Helpers ────────────────────────────────────────────────────────

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }
    return headers;
  }

  private buildPayload(
    request: ChatCompletionRequest,
    stream: boolean
  ): Record<string, unknown> {
    const payload: Record<string, unknown> = {
      model: request.model || this.model,
      messages: request.messages,
      temperature: request.temperature ?? 0.7,
      stream,
    };

    if (request.max_tokens) {
      payload.max_tokens = request.max_tokens;
    }
    if (request.top_p !== undefined) {
      payload.top_p = request.top_p;
    }
    if (request.stop) {
      payload.stop = request.stop;
    }
    if (request.tools && request.tools.length > 0) {
      payload.tools = request.tools;
      if (request.tool_choice) {
        payload.tool_choice = request.tool_choice;
      }
    }

    return payload;
  }

  private defaultModelInfo(): ModelInfo {
    return {
      id: this.model,
      name: this.model,
      vendor: this.id,
      maxInputTokens: 128000,
      maxOutputTokens: 4096,
      supportsTools: true,
      supportsVision: false,
    };
  }
}
