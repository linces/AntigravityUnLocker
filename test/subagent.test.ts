import * as assert from 'assert';
import { SubagentManager } from '../src/agent/subagent-manager';
import { ToolRegistry } from '../src/tools/tool-registry';
import { mockFileStore, setMockFile } from './vscode-mock';

describe('Subagent Delegation & Parallel Swarm Execution', () => {
  const outputChannel = {
    appendLine: () => {},
    dispose: () => {},
  } as any;

  let toolRegistry: ToolRegistry;

  beforeEach(() => {
    mockFileStore.clear();
    toolRegistry = new ToolRegistry(outputChannel);
  });

  function createMockProvider(responseCallback: (req: any) => any) {
    return {
      id: 'mock-llm',
      name: 'Mock LLM',
      config: { id: 'mock-llm', name: 'Mock', baseUrl: '', model: 'test-model', timeoutMs: 10000 },
      chat: async (req: any) => {
        return responseCallback(req);
      },
      stream: async function* () {},
      health: async () => ({ isHealthy: true, lastChecked: new Date() }),
      capabilities: () => ({ supportsStreaming: true, supportsTools: true, supportsVision: false, maxContextTokens: 128000 }),
    };
  }

  it('should execute a single delegated subagent mission with isolated persona context', async () => {
    let capturedSystemPrompt = '';

    const mockProvider = createMockProvider((req) => {
      capturedSystemPrompt = req.messages[0]?.content || '';
      return {
        id: 'resp_sub_1',
        object: 'chat.completion',
        created: Date.now(),
        model: 'test-model',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: 'Security audit complete: No vulnerabilities detected in authentication module.',
            },
            finish_reason: 'stop',
          },
        ],
      };
    });

    const mockManager = { getActiveProvider: () => mockProvider } as any;
    const subagentManager = new SubagentManager(mockManager, toolRegistry, outputChannel);

    const result = await subagentManager.runSubagent({
      personaId: 'security',
      taskDescription: 'Audit the authentication flow for OWASP vulnerabilities',
      contextSummary: 'auth.ts handles JWT token signing',
    });

    assert.strictEqual(result.status, 'success');
    assert.strictEqual(result.personaId, 'security');
    assert.strictEqual(result.personaName, 'Security');
    assert.ok(result.summary.includes('No vulnerabilities detected'));
    assert.ok(result.durationMs >= 0);

    // Verify system prompt contained Security persona and provided context
    assert.ok(capturedSystemPrompt.includes('Security'));
    assert.ok(capturedSystemPrompt.includes('Zero Trust'));
    assert.ok(capturedSystemPrompt.includes('auth.ts handles JWT token signing'));
  });

  it('should run multiple specialized subagents in parallel and aggregate results', async () => {
    const invokedPersonas: string[] = [];

    const mockProvider = createMockProvider((req) => {
      const sys = req.messages[0]?.content || '';
      let reply = 'Task finished.';
      if (sys.includes('Security')) {
        invokedPersonas.push('security');
        reply = 'Security report: Confinement verified.';
      } else if (sys.includes('Reviewer') || sys.includes('Sentinel')) {
        invokedPersonas.push('reviewer');
        reply = 'QA report: 100% test pass rate.';
      }

      return {
        id: 'resp_parallel',
        object: 'chat.completion',
        created: Date.now(),
        model: 'test-model',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: reply,
            },
            finish_reason: 'stop',
          },
        ],
      };
    });

    const mockManager = { getActiveProvider: () => mockProvider } as any;
    const subagentManager = new SubagentManager(mockManager, toolRegistry, outputChannel);

    const report = await subagentManager.runParallelSubagents([
      {
        taskId: 'sec_1',
        personaId: 'security',
        taskDescription: 'Audit data validation layer',
      },
      {
        taskId: 'qa_1',
        personaId: 'reviewer',
        taskDescription: 'Review test coverage for data layer',
      },
    ]);

    assert.strictEqual(report.totalTasks, 2);
    assert.strictEqual(report.successfulTasks, 2);
    assert.strictEqual(report.failedTasks, 0);
    assert.strictEqual(report.results.length, 2);

    assert.ok(invokedPersonas.includes('security'));
    assert.ok(invokedPersonas.includes('reviewer'));

    const secResult = report.results.find((r) => r.taskId === 'sec_1');
    assert.ok(secResult?.summary.includes('Confinement verified'));

    const qaResult = report.results.find((r) => r.taskId === 'qa_1');
    assert.ok(qaResult?.summary.includes('100% test pass rate'));
  });

  it('should block subagent delegation when maximum recursion depth is reached', async () => {
    const mockProvider = createMockProvider(() => ({
      id: 'resp_blocked',
      object: 'chat.completion',
      created: Date.now(),
      model: 'test-model',
      choices: [{ index: 0, message: { role: 'assistant', content: 'Blocked' }, finish_reason: 'stop' }],
    }));

    const mockManager = { getActiveProvider: () => mockProvider } as any;
    const subagentManager = new SubagentManager(mockManager, toolRegistry, outputChannel);

    // Run with currentDepth=2 and maxDepth=2 (already at limit)
    const result = await subagentManager.runSubagent(
      {
        personaId: 'coder',
        taskDescription: 'Deep nested task',
      },
      undefined,
      { maxDepth: 2 },
      2 // currentDepth
    );

    assert.strictEqual(result.status, 'failed');
    assert.ok(result.summary.includes('Maximum subagent depth of 2 reached'));
    assert.ok(result.error?.includes('Maximum subagent depth of 2 reached'));
  });

  it('should expose ag_delegateTask and ag_delegateParallelTasks in ToolRegistry', async () => {
    const mockProvider = createMockProvider((req) => {
      return {
        id: 'resp_tool',
        object: 'chat.completion',
        created: Date.now(),
        model: 'test-model',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: 'Subagent executed tool successfully.',
            },
            finish_reason: 'stop',
          },
        ],
      };
    });

    const mockManager = { getActiveProvider: () => mockProvider } as any;
    const subagentManager = new SubagentManager(mockManager, toolRegistry, outputChannel);
    toolRegistry.setSubagentManager(subagentManager);

    // Verify tool definitions exist
    const toolDefs = toolRegistry.getToolDefinitions();
    const delegateSingle = toolDefs.find((t) => t.function.name === 'ag_delegateTask');
    const delegateParallel = toolDefs.find((t) => t.function.name === 'ag_delegateParallelTasks');

    assert.ok(delegateSingle, 'ag_delegateTask must be defined in ToolRegistry');
    assert.ok(delegateParallel, 'ag_delegateParallelTasks must be defined in ToolRegistry');

    // Execute ag_delegateTask via ToolRegistry
    const singleResultRaw = await toolRegistry.executeTool('ag_delegateTask', {
      personaId: 'coder',
      taskDescription: 'Refactor helper functions',
      contextSummary: 'utils.ts has duplicate code',
    });

    const singleResult = JSON.parse(singleResultRaw);
    assert.strictEqual(singleResult.status, 'success');
    assert.strictEqual(singleResult.persona, 'Coder');
    assert.ok(singleResult.summary.includes('Subagent executed tool successfully'));

    // Execute ag_delegateParallelTasks via ToolRegistry
    const parallelResultRaw = await toolRegistry.executeTool('ag_delegateParallelTasks', {
      tasks: [
        { personaId: 'coder', taskDescription: 'Fix typing' },
        { personaId: 'reviewer', taskDescription: 'Check regression' },
      ],
    });

    const parallelReport = JSON.parse(parallelResultRaw);
    assert.strictEqual(parallelReport.totalTasks, 2);
    assert.strictEqual(parallelReport.successfulTasks, 2);
    assert.strictEqual(parallelReport.failedTasks, 0);
  });
});
