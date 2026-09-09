import * as assert from 'assert';
import { WorkspaceIndexer } from '../src/agent/workspace-indexer';
import { ToolRegistry } from '../src/tools/tool-registry';
import { setMockFile, mockFileStore } from './vscode-mock';

describe('Workspace Context Indexer', () => {
  const outputChannel = {
    appendLine: () => {},
    dispose: () => {},
  } as any;

  beforeEach(() => {
    mockFileStore.clear();
  });

  it('should scan workspace and group files by category', async () => {
    setMockFile('/mock/workspace/src/index.ts', 'console.log("hello");');
    setMockFile('/mock/workspace/src/utils.ts', 'export const x = 1;');
    setMockFile('/mock/workspace/package.json', '{"name": "test"}');
    setMockFile('/mock/workspace/README.md', '# Test Project');

    const digest = await WorkspaceIndexer.getWorkspaceDigest();

    assert.strictEqual(digest.totalFiles, 4);
    assert.strictEqual(digest.filesByCategory.source.length, 2);
    assert.strictEqual(digest.filesByCategory.configs.length, 1);
    assert.strictEqual(digest.filesByCategory.docs.length, 1);

    assert.ok(digest.summaryText.includes('📁 Workspace: "workspace"'));
    assert.ok(digest.summaryText.includes('src/index.ts'));
    assert.ok(digest.summaryText.includes('package.json'));
    assert.ok(digest.summaryText.includes('README.md'));
  });

  it('should be registered as ag_workspaceDigest in ToolRegistry and execute successfully', async () => {
    setMockFile('/mock/workspace/src/agent.ts', 'export class Agent {}');

    const toolRegistry = new ToolRegistry(outputChannel);
    const defs = toolRegistry.getToolDefinitions();
    const toolDef = defs.find((t) => t.function.name === 'ag_workspaceDigest');

    assert.ok(toolDef, 'ag_workspaceDigest should be registered in tool definitions');
    assert.ok(toolDef?.function.description.includes('compact overview'));

    const result = await toolRegistry.executeTool('ag_workspaceDigest', { maxFiles: 50 });
    assert.ok(result.includes('Workspace: "workspace"'));
    assert.ok(result.includes('src/agent.ts'));
  });
});
