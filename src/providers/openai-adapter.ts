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
import { getPreset } from './provider-registry';

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
          let formattedError = errorText;
          try {
            const parsedErr = JSON.parse(errorText);
            if (parsedErr?.error?.message) {
              formattedError = parsedErr.error.message;
            }
          } catch {
            // Keep raw text if not JSON
          }
          const isTransient = [429, 502, 503, 504].includes(response.status);
          const err = new Error(`HTTP ${response.status}: ${formattedError}`);
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
    const timer = setTimeout(() => controller.abort(), Math.max(this.timeoutMs, 120000));

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
          const rawText = await response.text();
          errorText = rawText;
          try {
            const parsed = JSON.parse(rawText);
            if (parsed?.error?.message) {
              errorText = parsed.error.message;
            }
          } catch {
            // ignore JSON parse error
          }
        } catch {
          // ignore
        }
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const body = response.body as any;
      let asyncChunks: AsyncIterable<Uint8Array>;

      if (typeof body.getReader === 'function') {
        const r = body.getReader() as ReadableStreamDefaultReader<Uint8Array>;
        reader = r;
        asyncChunks = {
          async *[Symbol.asyncIterator]() {
            while (true) {
              const { done, value } = await r.read();
              if (done) { break; }
              if (value) { yield value; }
            }
          },
        };
      } else if (Symbol.asyncIterator in body) {
        asyncChunks = body as AsyncIterable<Uint8Array>;
      } else {
        throw new Error('Response body is not streamable in this environment.');
      }

      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      for await (const chunk of asyncChunks) {
        // Clear connection timeout once data starts streaming
        clearTimeout(timer);

        buffer += decoder.decode(chunk, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('data:')) {
            const dataStr = trimmed.slice(5).trim();
            if (dataStr === '[DONE]') { return; }
            try {
              const parsed = JSON.parse(dataStr);
              const choice = parsed.choices?.[0];
              if (choice) {
                const delta = choice.delta;
                const content = delta?.content;
                const reasoning = delta?.reasoning_content || delta?.reasoning;
                const text = choice.text;

                if (typeof content === 'string' && content.length > 0) {
                  yield content;
                } else if (typeof reasoning === 'string' && reasoning.length > 0) {
                  yield reasoning;
                } else if (typeof text === 'string' && text.length > 0) {
                  yield text;
                }
              }
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
    // Try multiple endpoints in order of preference
    const endpoints = [
      '/models',           // OpenAI padrão
      '/api/tags',         // Ollama
      '/v1/models',       // Outros compatíveis com OpenAI
    ];
    
    for (const endpoint of endpoints) {
      try {
        const response = await fetch(`${this.baseUrl}${endpoint}`, {
          method: 'GET',
          headers: this.buildHeaders(),
          signal: AbortSignal.timeout(3000),
        });
        
        if (response.ok) {
          return {
            isHealthy: true,
            latencyMs: Date.now() - start,
            lastChecked: new Date(),
          };
        }
      } catch {
        continue; // Tentar próximo endpoint
      }
    }
    
    return {
      isHealthy: false,
      latencyMs: Date.now() - start,
      error: 'Todos os endpoints de health check falharam',
      lastChecked: new Date(),
    };
  }

  public async listModels(): Promise<ModelInfo[]> {
    try {
      const response = await fetch(`${this.baseUrl}/models`, {
        method: 'GET',
        headers: this.buildHeaders(),
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        return this.getFallbackModels();
      }

      const data = (await response.json()) as { data?: Array<{ id: string }> };
      if (!data.data || !Array.isArray(data.data)) {
        return this.getFallbackModels();
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
      return this.getFallbackModels();
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
      messages: this.normalizeMessages(request.messages),
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

  private normalizeMessages(
    messages: Array<any>
  ): Array<Record<string, unknown>> {
    const isVisionSupported = this.isVisionCapable();

    return messages.map((m) => {
      if (Array.isArray(m.content)) {
        if (!isVisionSupported) {
          // Provider/Model does not support vision payload array — flatten to string
          const textPart = m.content.find((c: any) => c && c.type === 'text')?.text || '';
          const imgCount = m.content.filter((c: any) => c && c.type === 'image_url').length;
          const imgNote = imgCount > 0 ? `\n\n[Attached Screenshot/Image (${imgCount} image(s))]` : '';
          return { ...m, content: textPart + imgNote };
        }
      }
      return { ...m };
    });
  }

  private isVisionCapable(): boolean {
    const currentModel = (this.model || '').toLowerCase();
    if (this.id === 'openai') {
      return currentModel.includes('gpt-4') || currentModel.includes('o1') || currentModel.includes('vision');
    }
    if (this.id === 'openrouter') {
      return currentModel.includes('vision') || currentModel.includes('claude-3') || currentModel.includes('gemini') || currentModel.includes('vl');
    }
    return currentModel.includes('vision') || currentModel.includes('vl');
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

  private getFallbackModels(): ModelInfo[] {
    const preset = getPreset(this.id);
    if (preset?.availableModels && preset.availableModels.length > 0) {
      return preset.availableModels.map((m) => ({
        id: m,
        name: m,
        vendor: this.id,
        maxInputTokens: 128000,
        maxOutputTokens: 4096,
        supportsTools: true,
        supportsVision: m.toLowerCase().includes('vision') || m.toLowerCase().includes('vl'),
      }));
    }
    return [this.defaultModelInfo()];
  }
}
