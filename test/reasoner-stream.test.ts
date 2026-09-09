import * as assert from 'assert';
import { OpenAIAdapter } from '../src/providers/openai-adapter';

describe('Reasoner Stream & Thinking Blocks', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('should wrap reasoning_content chunks inside <think> tags', async () => {
    const sseLines = [
      'data: {"choices":[{"delta":{"reasoning_content":"Analyzing the problem..."}}]}\n\n',
      'data: {"choices":[{"delta":{"reasoning_content":" and deducing solution."}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"Here is the final result."}}]}\n\n',
      'data: [DONE]\n\n',
    ];

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const line of sseLines) {
          controller.enqueue(encoder.encode(line));
        }
        controller.close();
      },
    });

    global.fetch = async () => ({
      ok: true,
      status: 200,
      body: stream,
    } as any);

    const adapter = new OpenAIAdapter({
      id: 'deepseek',
      name: 'DeepSeek',
      baseUrl: 'https://api.deepseek.com/v1',
      model: 'deepseek-reasoner',
      timeoutMs: 30000,
    });

    const chunks: string[] = [];
    for await (const chunk of adapter.stream({
      model: 'deepseek-reasoner',
      messages: [{ role: 'user', content: 'solve' }],
    })) {
      chunks.push(chunk);
    }

    const fullText = chunks.join('');
    assert.ok(fullText.includes('<think>\nAnalyzing the problem... and deducing solution.\n</think>\n\n'));
    assert.ok(fullText.includes('Here is the final result.'));
  });

  it('should not inject <think> tags for standard content streams without reasoning', async () => {
    const sseLines = [
      'data: {"choices":[{"delta":{"content":"Direct answer."}}]}\n\n',
      'data: [DONE]\n\n',
    ];

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const line of sseLines) {
          controller.enqueue(encoder.encode(line));
        }
        controller.close();
      },
    });

    global.fetch = async () => ({
      ok: true,
      status: 200,
      body: stream,
    } as any);

    const adapter = new OpenAIAdapter({
      id: 'openai',
      name: 'OpenAI',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o',
      timeoutMs: 30000,
    });

    const chunks: string[] = [];
    for await (const chunk of adapter.stream({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'hello' }],
    })) {
      chunks.push(chunk);
    }

    const fullText = chunks.join('');
    assert.strictEqual(fullText.includes('<think>'), false);
    assert.strictEqual(fullText.includes('</think>'), false);
    assert.strictEqual(fullText, 'Direct answer.');
  });
});
