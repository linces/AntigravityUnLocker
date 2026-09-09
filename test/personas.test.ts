import * as assert from 'assert';
import { PersonaRegistry, AGENT_PERSONAS } from '../src/agent/personas';
import { AgentEngine } from '../src/agent/engine';
import { ToolRegistry } from '../src/tools/tool-registry';

describe('SynAI Multi-Persona Swarm', () => {
  const outputChannel = {
    appendLine: () => {},
    dispose: () => {},
  } as any;

  it('should list all 5 specialized personas with required metadata', () => {
    const personas = PersonaRegistry.getAll();
    assert.strictEqual(personas.length, 5);

    const ids = personas.map((p) => p.id);
    assert.ok(ids.includes('supervisor'));
    assert.ok(ids.includes('planner'));
    assert.ok(ids.includes('coder'));
    assert.ok(ids.includes('security'));
    assert.ok(ids.includes('reviewer'));

    for (const p of personas) {
      assert.ok(p.name, `Persona ${p.id} should have name`);
      assert.ok(p.title, `Persona ${p.id} should have title`);
      assert.ok(p.icon, `Persona ${p.id} should have icon`);
      assert.ok(p.systemPrompt.length > 50, `Persona ${p.id} should have comprehensive system prompt`);
    }
  });

  it('should find persona by case-insensitive ID and provide default fallback', () => {
    const sec = PersonaRegistry.get('SECURITY');
    assert.ok(sec);
    assert.strictEqual(sec?.id, 'security');
    assert.strictEqual(sec?.icon, '🛡️');

    const unknown = PersonaRegistry.get('nonexistent');
    assert.strictEqual(unknown, undefined);

    const def = PersonaRegistry.getDefault();
    assert.strictEqual(def.id, 'supervisor');
  });

  it('should construct enriched system prompt including contextual instructions', () => {
    const prompt = PersonaRegistry.buildSystemPrompt('coder', 'Focus on refactoring UserService');
    assert.ok(prompt.includes(AGENT_PERSONAS.coder.systemPrompt));
    assert.ok(prompt.includes('Focus on refactoring UserService'));
  });

  it('should integrate persona with AgentEngine loop', async () => {
    const toolRegistry = new ToolRegistry(outputChannel);
    let capturedSystemPrompt = '';

    const mockProvider = {
      id: 'mock-provider',
      name: 'Mock Provider',
      config: { id: 'mock-provider', name: 'Mock', baseUrl: '', model: 'mock-model' },
      chat: async (req: any) => {
        const sysMsg = req.messages.find((m: any) => m.role === 'system');
        if (sysMsg) {
          capturedSystemPrompt = sysMsg.content;
        }
        return {
          id: 'test-resp',
          object: 'chat.completion',
          created: Date.now(),
          model: 'mock-model',
          choices: [
            {
              index: 0,
              message: { role: 'assistant', content: 'Audited with zero security issues found.' },
              finish_reason: 'stop',
            },
          ],
        };
      },
    };

    const mockProviderManager = {
      getActiveProvider: () => mockProvider,
    } as any;

    const engine = new AgentEngine(mockProviderManager, toolRegistry, outputChannel);
    const result = await engine.run(
      'Audit the codebase',
      'Base instruction',
      undefined,
      undefined,
      'security'
    );

    assert.ok(capturedSystemPrompt.includes('Zero Trust & Threat Auditor'));
    assert.ok(capturedSystemPrompt.includes('Base instruction'));
    assert.strictEqual(result.response, 'Audited with zero security issues found.');
  });
});
