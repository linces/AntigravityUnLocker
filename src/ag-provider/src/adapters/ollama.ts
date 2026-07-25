import { OpenAIAdapter, OpenAIAdapterConfig } from './openai.js';

export interface OllamaAdapterConfig extends Omit<OpenAIAdapterConfig, 'apiKey'> {
  apiKey?: string;
}

export class OllamaAdapter extends OpenAIAdapter {
  constructor(config: OllamaAdapterConfig) {
    super({
      ...config,
      apiKey: config.apiKey || 'ollama',
    });
  }
}
