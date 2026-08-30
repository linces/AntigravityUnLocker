import * as assert from 'assert';
import { AgentEngine } from '../src/agent/engine';
import { ToolRegistry } from '../src/tools/tool-registry';
import { setMockFile, getMockFile, mockFileStore } from './vscode-mock';

describe('Agent Engine', () => {
  const outputChannel = {
    appendLine: () => {},
    dispose: () => {},
  } as any;

  let toolRegistry: ToolRegistry;

  beforeEach(() => {
    mockFileStore.clear();
    toolRegistry = new ToolRegistry(outputChannel);
  });

  it('should execute extracted JSON tool calls from text response when native tool_calls are absent', async () => {
    setMockFile('/mock/workspace/src/sample.ts', 'let count = 0;');

    let callCount = 0;
    const mockProvider = {
      id: 'mock-local',
      name: 'Mock Local LLM',
      config: { id: 'mock-local', name: 'Mock', baseUrl: '', model: 'qwen', timeoutMs: 10000 },
      chat: async (req: any) => {
        callCount++;
        if (callCount === 1) {
          // Model returns tool call in text markdown block
          return {
            id: 'resp_1',
            object: 'chat.completion',
            created: Date.now(),
            model: 'qwen',
            choices: [
              {
                index: 0,
                message: {
                  role: 'assistant',
                  content: '```json\n{\n  "tool_calls": [\n    {\n      "function": {\n        "name": "ag_replaceInFile",\n        "arguments": "{\\"path\\": \\"src/sample.ts\\", \\"targetContent\\": \\"let count = 0;\\", \\"replacementContent\\": \\"let count = 42;\\"}"\n      }\n    }\n  ]\n}\n```',
                },
                finish_reason: 'stop',
              },
            ],
          };
        } else {
          // Second iteration: final answer after tool execution
          return {
            id: 'resp_2',
            object: 'chat.completion',
            created: Date.now(),
            model: 'qwen',
            choices: [
              {
                index: 0,
                message: {
                  role: 'assistant',
                  content: 'I have updated count to 42.',
                },
                finish_reason: 'stop',
              },
            ],
          };
        }
      },
      stream: async function* () {},
      health: async () => ({ isHealthy: true, lastChecked: new Date() }),
      capabilities: () => ({ supportsStreaming: true, supportsTools: true, supportsVision: false, maxContextTokens: 128000 }),
    };

    const mockProviderManager = {
      getActiveProvider: () => mockProvider,
    } as any;

    const agentEngine = new AgentEngine(mockProviderManager, toolRegistry, outputChannel);

    const result = await agentEngine.run(
      'Update count to 42',
      'You are AG AI Agent.'
    );

    assert.strictEqual(result.iterations, 2);
    assert.strictEqual(result.toolCalls.length, 1);
    assert.strictEqual(result.toolCalls[0].name, 'ag_replaceInFile');
    assert.ok(result.response.includes('42'));

    const updated = getMockFile('/mock/workspace/src/sample.ts');
    assert.strictEqual(updated, 'let count = 42;');
  });
});
