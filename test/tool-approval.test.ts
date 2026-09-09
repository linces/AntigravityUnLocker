import * as assert from 'assert';
import { AgentEngine } from '../src/agent/engine';
import { ToolRegistry } from '../src/tools/tool-registry';
import { EditTools } from '../src/tools/edit-tools';
import { FileTools } from '../src/tools/file-tools';
import { ToolApprovalRequest, ToolApprovalDecision } from '../src/agent/approval';
import { setMockFile, getMockFile, mockFileStore } from './vscode-mock';

describe('Human-in-the-Loop Tool Approval & Diff Preview', () => {
  const outputChannel = {
    appendLine: () => {},
    dispose: () => {},
  } as any;

  let toolRegistry: ToolRegistry;
  let editTools: EditTools;
  let fileTools: FileTools;

  beforeEach(() => {
    mockFileStore.clear();
    toolRegistry = new ToolRegistry(outputChannel);
    editTools = toolRegistry.editTools;
    fileTools = toolRegistry.fileTools;
  });

  describe('Diff Previews (In-memory without disk mutation)', () => {
    it('should generate in-memory diff preview for previewReplace without mutating disk', async () => {
      const initialContent = 'const port = 3000;\nconst host = "localhost";\n';
      setMockFile('/mock/workspace/src/server.ts', initialContent);

      const preview = await editTools.previewReplace(
        'src/server.ts',
        'const port = 3000;',
        'const port = 8080;'
      );

      assert.strictEqual(preview.error, undefined);
      assert.strictEqual(preview.original, initialContent);
      assert.strictEqual(preview.proposed, 'const port = 8080;\nconst host = "localhost";\n');

      // Verify file on mock disk was NOT changed
      const diskContent = getMockFile('/mock/workspace/src/server.ts');
      assert.strictEqual(diskContent, initialContent);
    });

    it('should return error in previewReplace when targetContent is not found', async () => {
      setMockFile('/mock/workspace/src/app.ts', 'const x = 1;');

      const preview = await editTools.previewReplace(
        'src/app.ts',
        'const missing = 2;',
        'const missing = 3;'
      );

      assert.ok(preview.error);
      assert.ok(preview.error?.includes('Target content not found'));
    });

    it('should generate in-memory diff preview for previewMultiReplace without mutating disk', async () => {
      const initialContent = 'line 1\nline 2\nline 3\n';
      setMockFile('/mock/workspace/src/multi.txt', initialContent);

      const preview = await editTools.previewMultiReplace('src/multi.txt', [
        { targetContent: 'line 1', replacementContent: 'alpha' },
        { targetContent: 'line 3', replacementContent: 'omega' },
      ]);

      assert.strictEqual(preview.error, undefined);
      assert.strictEqual(preview.original, initialContent);
      assert.strictEqual(preview.proposed, 'alpha\nline 2\nomega\n');

      // Verify disk was untouched
      assert.strictEqual(getMockFile('/mock/workspace/src/multi.txt'), initialContent);
    });

    it('should generate diff preview for previewWriteFile for existing and new files', async () => {
      // Existing file
      setMockFile('/mock/workspace/README.md', '# Old Title');
      const existingPreview = await fileTools.previewWriteFile('README.md', '# New Title');
      assert.strictEqual(existingPreview.isNew, false);
      assert.strictEqual(existingPreview.original, '# Old Title');
      assert.strictEqual(existingPreview.proposed, '# New Title');
      assert.strictEqual(getMockFile('/mock/workspace/README.md'), '# Old Title');

      // New file
      const newPreview = await fileTools.previewWriteFile('docs/NEW.md', '# Fresh Doc');
      assert.strictEqual(newPreview.isNew, true);
      assert.strictEqual(newPreview.original, '');
      assert.strictEqual(newPreview.proposed, '# Fresh Doc');
      assert.strictEqual(getMockFile('/mock/workspace/docs/NEW.md'), undefined);
    });
  });

  describe('Agent Engine Approval Flow', () => {
    function createMockProvider(toolArgs: string) {
      let callCount = 0;
      return {
        id: 'mock-llm',
        name: 'Mock LLM',
        config: { id: 'mock-llm', name: 'Mock', baseUrl: '', model: 'test-model', timeoutMs: 10000 },
        chat: async (req: any) => {
          callCount++;
          if (callCount === 1) {
            return {
              id: 'resp_1',
              object: 'chat.completion',
              created: Date.now(),
              model: 'test-model',
              choices: [
                {
                  index: 0,
                  message: {
                    role: 'assistant',
                    content: '```json\n{\n  "tool_calls": [\n    {\n      "function": {\n        "name": "ag_replaceInFile",\n        "arguments": ' + JSON.stringify(toolArgs) + '\n      }\n    }\n  ]\n}\n```',
                  },
                  finish_reason: 'stop',
                },
              ],
            };
          } else {
            const lastMsg = req.messages[req.messages.length - 1];
            return {
              id: 'resp_2',
              object: 'chat.completion',
              created: Date.now(),
              model: 'test-model',
              choices: [
                {
                  index: 0,
                  message: {
                    role: 'assistant',
                    content: `Final response. Last observation: ${lastMsg.content}`,
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
    }

    it('should allow tool execution when approval callback returns allow', async () => {
      setMockFile('/mock/workspace/src/test.ts', 'let val = 1;');
      const mockProvider = createMockProvider('{"path": "src/test.ts", "targetContent": "let val = 1;", "replacementContent": "let val = 2;"}');
      const mockManager = { getActiveProvider: () => mockProvider } as any;
      const engine = new AgentEngine(mockManager, toolRegistry, outputChannel);

      let requestedApproval: ToolApprovalRequest | undefined;
      const result = await engine.run(
        'Update val to 2',
        'System prompt',
        undefined,
        undefined,
        undefined,
        {
          approvalPolicy: 'interactive',
          onToolApproval: async (req: ToolApprovalRequest): Promise<ToolApprovalDecision> => {
            requestedApproval = req;
            return { action: 'allow' };
          },
        }
      );

      assert.ok(requestedApproval);
      assert.strictEqual(requestedApproval?.toolName, 'ag_replaceInFile');
      assert.strictEqual(requestedApproval?.filePath, 'src/test.ts');
      assert.ok(requestedApproval?.diff);
      assert.strictEqual(requestedApproval?.diff?.originalContent, 'let val = 1;');
      assert.strictEqual(requestedApproval?.diff?.proposedContent, 'let val = 2;');

      // File was updated on disk
      assert.strictEqual(getMockFile('/mock/workspace/src/test.ts'), 'let val = 2;');
      assert.strictEqual(result.toolCalls.length, 1);
    });

    it('should skip tool execution and notify LLM when approval callback returns skip', async () => {
      setMockFile('/mock/workspace/src/skip.ts', 'let safe = true;');
      const mockProvider = createMockProvider('{"path": "src/skip.ts", "targetContent": "let safe = true;", "replacementContent": "let safe = false;"}');
      const mockManager = { getActiveProvider: () => mockProvider } as any;
      const engine = new AgentEngine(mockManager, toolRegistry, outputChannel);

      let requestedApproval: ToolApprovalRequest | undefined;
      const result = await engine.run(
        'Change safe to false',
        'System prompt',
        undefined,
        undefined,
        undefined,
        {
          approvalPolicy: 'interactive',
          onToolApproval: async (req: ToolApprovalRequest): Promise<ToolApprovalDecision> => {
            requestedApproval = req;
            return { action: 'skip', reason: 'User declined modification' };
          },
        }
      );

      assert.ok(requestedApproval);
      assert.strictEqual(requestedApproval?.toolName, 'ag_replaceInFile');

      // File was NOT changed on disk
      assert.strictEqual(getMockFile('/mock/workspace/src/skip.ts'), 'let safe = true;');
      // LLM received feedback that action was skipped
      assert.ok(result.response.includes('Tool Skipped by User'));
      assert.ok(result.response.includes('User declined modification'));
    });

    it('should bypass approval callback when approvalPolicy is always', async () => {
      setMockFile('/mock/workspace/src/auto.ts', 'let a = 10;');
      const mockProvider = createMockProvider('{"path": "src/auto.ts", "targetContent": "let a = 10;", "replacementContent": "let a = 20;"}');
      const mockManager = { getActiveProvider: () => mockProvider } as any;
      const engine = new AgentEngine(mockManager, toolRegistry, outputChannel);

      let approvalCalled = false;
      await engine.run(
        'Auto approve test',
        'System prompt',
        undefined,
        undefined,
        undefined,
        {
          approvalPolicy: 'always',
          onToolApproval: async () => {
            approvalCalled = true;
            return { action: 'allow' };
          },
        }
      );

      assert.strictEqual(approvalCalled, false);
      assert.strictEqual(getMockFile('/mock/workspace/src/auto.ts'), 'let a = 20;');
    });
  });
});
