import * as assert from 'assert';
import { DomainRulesManager } from '../src/domains/domain-rules-manager';
import { ToolRegistry } from '../src/tools/tool-registry';
import { setMockFile, mockFileStore } from './vscode-mock';

describe('Universal Domain & Workspace Rules Engine', () => {
  const outputChannel = {
    appendLine: () => {},
    dispose: () => {},
  } as any;

  let manager: DomainRulesManager;

  beforeEach(() => {
    mockFileStore.clear();
    manager = new DomainRulesManager(outputChannel);
  });

  afterEach(() => {
    manager.dispose();
  });

  it('should discover rules across .agents, Cursor, Windsurf, Copilot, and Claude ecosystems', async () => {
    // 1. Antigravity / Gemini
    setMockFile(
      '/mock/workspace/.agents/AGENTS.md',
      '# Workspace Rules\nFollow zero stub and clean footer rules.'
    );

    // 2. Cursor Legacy
    setMockFile('/mock/workspace/.cursorrules', 'Always write clean TypeScript code.');

    // 3. Cursor MDC with frontmatter
    setMockFile(
      '/mock/workspace/.cursor/rules/tech.mdc',
      `---
description: TypeScript Architecture
globs: *.ts, src/**/*.tsx
alwaysApply: false
---
Use strict types and no any.`
    );

    // 4. Windsurf
    setMockFile('/mock/workspace/.windsurfrules', 'Keep components modular and reactive.');

    // 5. Copilot
    setMockFile(
      '/mock/workspace/.github/copilot-instructions.md',
      'Ensure test coverage for critical paths.'
    );

    // 6. Claude
    setMockFile('/mock/workspace/CLAUDE.md', 'Prefer explicit patterns over implicit magic.');

    const rules = await manager.discoverRules();

    assert.strictEqual(rules.length, 6, 'Should discover all 6 ecosystem rules');

    const sources = rules.map((r) => r.source);
    assert.ok(sources.includes('agents'), 'Must include agents source');
    assert.ok(sources.includes('cursor'), 'Must include cursor source');
    assert.ok(sources.includes('windsurf'), 'Must include windsurf source');
    assert.ok(sources.includes('copilot'), 'Must include copilot source');
    assert.ok(sources.includes('claude'), 'Must include claude source');

    const summary = manager.getSummary();
    assert.strictEqual(summary.totalRules, 6);
    assert.strictEqual(summary.sources.agents, 1);
    assert.strictEqual(summary.sources.cursor, 2);
    assert.strictEqual(summary.sources.windsurf, 1);
    assert.strictEqual(summary.sources.copilot, 1);
    assert.strictEqual(summary.sources.claude, 1);
  });

  it('should parse MDC frontmatter correctly and handle glob matching', async () => {
    setMockFile(
      '/mock/workspace/.cursor/rules/api-spec.mdc',
      `---
description: Backend REST API Spec
globs: src/api/**/*.ts, controllers/*.ts
alwaysApply: false
---
All REST handlers must return unified ApiResponse<T>.`
    );

    setMockFile(
      '/mock/workspace/.agents/AGENTS.md',
      '# Global Workspace Policy\nApplies everywhere.'
    );

    await manager.discoverRules();

    // Matching file path
    const matchingRules = manager.getActiveRules('/mock/workspace/src/api/users.ts');
    assert.strictEqual(matchingRules.length, 2, 'Should match both global and glob-matched rule');
    assert.ok(matchingRules.some((r) => r.title.includes('api-spec')));

    // Non-matching file path
    const nonMatchingRules = manager.getActiveRules('/mock/workspace/styles/main.css');
    assert.strictEqual(nonMatchingRules.length, 1, 'Should only match the global always-apply rule');
    assert.strictEqual(nonMatchingRules[0].source, 'agents');
  });

  it('should build formatted rules system prompt respecting precedence and ordering', async () => {
    setMockFile(
      '/mock/workspace/.agents/AGENTS.md',
      '# Agent Protocol\nHigh priority instructions.'
    );
    setMockFile('/mock/workspace/.cursorrules', 'Cursor instructions.');

    await manager.discoverRules();

    const prompt = manager.buildSystemRulesPrompt();
    assert.ok(prompt.includes('ACTIVE WORKSPACE & DOMAIN RULES'), 'Prompt must have standard banner');
    assert.ok(prompt.includes('[RULE SOURCE: AGENTS]'), 'Must format agents header');
    assert.ok(prompt.includes('[RULE SOURCE: CURSOR]'), 'Must format cursor header');

    // Agents (priority 100) must appear before Cursor (priority 90)
    const agentsIdx = prompt.indexOf('[RULE SOURCE: AGENTS]');
    const cursorIdx = prompt.indexOf('[RULE SOURCE: CURSOR]');
    assert.ok(agentsIdx < cursorIdx, 'Agents rules must precede Cursor rules by priority');
  });

  it('should expose ag_getWorkspaceRules tool via ToolRegistry with dynamic filtering', async () => {
    setMockFile(
      '/mock/workspace/.agents/AGENTS.md',
      'Production grade standards only.'
    );
    setMockFile(
      '/mock/workspace/.cursor/rules/frontend.mdc',
      `---
description: React standards
globs: **/*.tsx
alwaysApply: false
---
Use hooks properly.`
    );

    await manager.discoverRules();

    const toolRegistry = new ToolRegistry(outputChannel, manager);
    const definitions = toolRegistry.getToolDefinitions();
    const hasRulesTool = definitions.some((d) => d.function.name === 'ag_getWorkspaceRules');
    assert.ok(hasRulesTool, 'ToolRegistry must register ag_getWorkspaceRules tool');

    // Execute tool for matching file
    const resultJson = await toolRegistry.executeTool('ag_getWorkspaceRules', {
      activeFilePath: '/mock/workspace/components/Button.tsx',
    });
    const parsed = JSON.parse(resultJson);

    assert.strictEqual(parsed.totalRulesInWorkspace, 2);
    assert.strictEqual(parsed.activeRulesCount, 2);
    assert.ok(parsed.rules.some((r: any) => r.title.includes('frontend')));
  });
});
