import * as assert from 'assert';
import { OpenAIAdapter } from '../src/providers/openai-adapter';

describe('OpenAI Adapter', () => {
  it('should initialize with correct capabilities and headers', () => {
    const adapter = new OpenAIAdapter({
      id: 'groq',
      name: 'Groq (Ultra-Fast LPU)',
      baseUrl: 'https://api.groq.com/openai/v1',
      model: 'llama-3.3-70b-versatile',
      timeoutMs: 30000,
      apiKey: 'gsk_test_key_123',
    });

    assert.strictEqual(adapter.id, 'groq');
    assert.strictEqual(adapter.name, 'Groq (Ultra-Fast LPU)');
    
    const caps = adapter.capabilities();
    assert.strictEqual(caps.supportsStreaming, true);
    assert.strictEqual(caps.supportsTools, true);
  });
});
