import { ILLMProvider, ChatCompletionRequest, ChatCompletionResponse, ProviderCapabilities } from './base.js';

export interface OpenAIAdapterConfig {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs?: number;
}

export class OpenAIAdapter implements ILLMProvider {
  public id: string;
  public name: string;
  private baseUrl: string;
  private apiKey: string;
  private model: string;
  private timeoutMs: number;

  constructor(config: OpenAIAdapterConfig) {
    this.id = config.id;
    this.name = config.name;
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.apiKey = config.apiKey;
    this.model = config.model;
    this.timeoutMs = config.timeoutMs || 60000;
  }

  public capabilities(): ProviderCapabilities {
    return {
      supportsStreaming: true,
      supportsTools: true,
      supportsVision: true,
    };
  }

  public async chat(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    const url = `${this.baseUrl}/chat/completions`;
    const payload: Record<string, any> = {
      model: request.model || this.model,
      messages: request.messages,
      temperature: request.temperature ?? 0.7,
      max_tokens: request.max_tokens,
      stream: false,
    };

    if (request.tools && request.tools.length > 0) {
      payload.tools = request.tools;
      if (request.tool_choice) {
        payload.tool_choice = request.tool_choice;
      }
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenAI Provider HTTP Error ${response.status}: ${errorText}`);
      }

      return (await response.json()) as ChatCompletionResponse;
    } finally {
      clearTimeout(timer);
    }
  }

  public async *stream(request: ChatCompletionRequest): AsyncIterable<string> {
    const url = `${this.baseUrl}/chat/completions`;
    const payload: Record<string, any> = {
      model: request.model || this.model,
      messages: request.messages,
      temperature: request.temperature ?? 0.7,
      max_tokens: request.max_tokens,
      stream: true,
    };

    if (request.tools && request.tools.length > 0) {
      payload.tools = request.tools;
      if (request.tool_choice) {
        payload.tool_choice = request.tool_choice;
      }
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok || !response.body) {
      throw new Error(`OpenAI Stream Error HTTP ${response.status}`);
    }

    const reader = (response.body as any).getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('data: ')) {
          const dataStr = trimmed.slice(6);
          if (dataStr === '[DONE]') return;
          try {
            const parsed = JSON.parse(dataStr);
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) yield delta;
          } catch {}
        }
      }
    }
  }
}
