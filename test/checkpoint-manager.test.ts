import assert from 'assert';
import { CheckpointManager } from '../src/agent/checkpoint-manager';
import { setMockFile, getMockFile, mockFileStore } from './vscode-mock';

describe('CheckpointManager (Workspace Checkpoints & Rollback)', () => {
  let manager: CheckpointManager;

  beforeEach(() => {
    mockFileStore.clear();
    manager = new CheckpointManager();
  });

  afterEach(() => {
    manager.dispose();
  });

  it('should create an active checkpoint with unique ID and label', () => {
    const ckpt = manager.createCheckpoint('Before Refactoring');
    assert.ok(ckpt.id.startsWith('ckpt_'));
    assert.strictEqual(ckpt.label, 'Before Refactoring');
    assert.strictEqual(ckpt.status, 'active');
    assert.strictEqual(ckpt.source, 'agent');

    const active = manager.getActiveCheckpoint();
    assert.strictEqual(active?.id, ckpt.id);
  });

  it('should capture existing file state via Copy-on-Write', async () => {
    setMockFile('/mock/workspace/src/index.ts', 'console.log("hello");');
    const ckpt = manager.createCheckpoint('Edit Index');

    await manager.captureFileBeforeMutation('src/index.ts');

    assert.strictEqual(ckpt.files.size, 1);
    const snap = ckpt.files.get('src/index.ts');
    assert.ok(snap);
    assert.strictEqual(snap.existedBefore, true);
    assert.strictEqual(snap.originalContent, 'console.log("hello");');
  });

  it('should capture non-existent file as existedBefore=false', async () => {
    const ckpt = manager.createCheckpoint('Create New File');

    await manager.captureFileBeforeMutation('src/new-feature.ts');

    assert.strictEqual(ckpt.files.size, 1);
    const snap = ckpt.files.get('src/new-feature.ts');
    assert.ok(snap);
    assert.strictEqual(snap.existedBefore, false);
    assert.strictEqual(snap.originalContent, null);
  });

  it('should be idempotent: subsequent mutations preserve the original initial state', async () => {
    setMockFile('/mock/workspace/src/config.ts', 'export const PORT = 3000;');
    manager.createCheckpoint('Multi-step edit');

    // First mutation capture
    await manager.captureFileBeforeMutation('src/config.ts');
    // Simulate first edit
    setMockFile('/mock/workspace/src/config.ts', 'export const PORT = 4000;');

    // Second mutation capture during the same checkpoint
    await manager.captureFileBeforeMutation('src/config.ts');

    const ckpt = manager.getActiveCheckpoint();
    const snap = ckpt?.files.get('src/config.ts');
    // Must remain initial original content (3000, NOT 4000)
    assert.strictEqual(snap?.originalContent, 'export const PORT = 3000;');
  });

  it('should rollback modified existing file to original content', async () => {
    setMockFile('/mock/workspace/src/app.ts', 'const x = 1;');
    manager.createCheckpoint('Modify App');

    await manager.captureFileBeforeMutation('src/app.ts');

    // Agent modifies file
    setMockFile('/mock/workspace/src/app.ts', 'const x = 999; // buggy edit');

    // Rollback
    const result = await manager.rollbackCheckpoint();
    assert.strictEqual(result.success, true);
    assert.deepStrictEqual(result.restoredFiles, ['src/app.ts']);
    assert.deepStrictEqual(result.deletedFiles, []);

    // File content must be restored
    assert.strictEqual(getMockFile('/mock/workspace/src/app.ts'), 'const x = 1;');
  });

  it('should rollback newly created file by deleting it from workspace', async () => {
    manager.createCheckpoint('Agent creates file');

    // File does not exist initially
    await manager.captureFileBeforeMutation('src/temp.ts');

    // Agent creates file
    setMockFile('/mock/workspace/src/temp.ts', 'temporary file content');
    assert.ok(getMockFile('/mock/workspace/src/temp.ts'));

    // Rollback
    const result = await manager.rollbackCheckpoint();
    assert.strictEqual(result.success, true);
    assert.deepStrictEqual(result.deletedFiles, ['src/temp.ts']);
    assert.deepStrictEqual(result.restoredFiles, []);

    // File must be deleted
    assert.strictEqual(getMockFile('/mock/workspace/src/temp.ts'), undefined);
  });

  it('should rollback multiple mixed files (restoring modified and deleting created)', async () => {
    setMockFile('/mock/workspace/file1.ts', 'file 1 original');
    setMockFile('/mock/workspace/file2.ts', 'file 2 original');
    manager.createCheckpoint('Mixed batch');

    await manager.captureFileBeforeMutation('file1.ts');
    await manager.captureFileBeforeMutation('file2.ts');
    await manager.captureFileBeforeMutation('file3_new.ts');

    // Agent modifies file1 and creates file3, leaves file2 as-is
    setMockFile('/mock/workspace/file1.ts', 'file 1 mutated');
    setMockFile('/mock/workspace/file3_new.ts', 'file 3 created');

    const result = await manager.rollbackCheckpoint();
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.restoredFiles.length, 2); // file1 and file2 restored
    assert.deepStrictEqual(result.deletedFiles, ['file3_new.ts']);

    assert.strictEqual(getMockFile('/mock/workspace/file1.ts'), 'file 1 original');
    assert.strictEqual(getMockFile('/mock/workspace/file2.ts'), 'file 2 original');
    assert.strictEqual(getMockFile('/mock/workspace/file3_new.ts'), undefined);
  });

  it('should compute diff between original snapshot and current disk state', async () => {
    setMockFile('/mock/workspace/src/service.ts', 'class Service {}');
    manager.createCheckpoint('Diff check');

    await manager.captureFileBeforeMutation('src/service.ts');
    await manager.captureFileBeforeMutation('src/added.ts');

    // Make disk changes
    setMockFile('/mock/workspace/src/service.ts', 'class Service { run() {} }');
    setMockFile('/mock/workspace/src/added.ts', 'export const ADDED = true;');

    const diffs = await manager.getCheckpointDiff();
    assert.strictEqual(diffs.length, 2);

    const modDiff = diffs.find((d) => d.filePath === 'src/service.ts');
    assert.strictEqual(modDiff?.status, 'modified');
    assert.strictEqual(modDiff?.originalContent, 'class Service {}');
    assert.strictEqual(modDiff?.currentContent, 'class Service { run() {} }');

    const addDiff = diffs.find((d) => d.filePath === 'src/added.ts');
    assert.strictEqual(addDiff?.status, 'added');
    assert.strictEqual(addDiff?.originalContent, '');
    assert.strictEqual(addDiff?.currentContent, 'export const ADDED = true;');
  });

  it('should complete active checkpoint and clear activeCheckpointId', () => {
    const ckpt = manager.createCheckpoint('Task 1');
    assert.strictEqual(ckpt.status, 'active');

    manager.completeCheckpoint();
    assert.strictEqual(ckpt.status, 'completed');
    assert.strictEqual(manager.getActiveCheckpoint(), undefined);
  });

  it('should mark checkpoint status as reverted and record restoredAt', async () => {
    const ckpt = manager.createCheckpoint('Rollback Status Check');
    await manager.rollbackCheckpoint(ckpt.id);

    assert.strictEqual(ckpt.status, 'reverted');
    assert.ok(ckpt.restoredAt);
  });

  it('should list checkpoints in reverse chronological order', () => {
    manager.createCheckpoint('First Task');
    manager.completeCheckpoint();
    manager.createCheckpoint('Second Task');
    manager.completeCheckpoint();

    const list = manager.listCheckpoints();
    assert.strictEqual(list.length, 2);
    assert.strictEqual(list[0].label, 'Second Task');
    assert.strictEqual(list[1].label, 'First Task');
  });

  it('should delete checkpoint by ID', () => {
    const ckpt = manager.createCheckpoint('To Delete');
    assert.strictEqual(manager.deleteCheckpoint(ckpt.id), true);
    assert.strictEqual(manager.getCheckpoint(ckpt.id), undefined);
    assert.strictEqual(manager.deleteCheckpoint('non_existent'), false);
  });

  it('should clear all checkpoints', () => {
    manager.createCheckpoint('Task A');
    manager.createCheckpoint('Task B');
    assert.strictEqual(manager.listCheckpoints().length, 2);

    manager.clearAll();
    assert.strictEqual(manager.listCheckpoints().length, 0);
    assert.strictEqual(manager.getActiveCheckpoint(), undefined);
  });

  it('should normalize paths with windows and unix separators', () => {
    assert.strictEqual(manager.normalizePath('src\\utils\\file.ts'), 'src/utils/file.ts');
    assert.strictEqual(
      manager.normalizePath('/mock/workspace/src/index.ts'),
      'src/index.ts'
    );
  });

  it('should expose and execute checkpoint tools via ToolRegistry', async () => {
    const { ToolRegistry } = await import('../src/tools/tool-registry');
    const { window } = await import('./vscode-mock');
    const registry = new ToolRegistry(window.createOutputChannel() as any);
    registry.setCheckpointManager(manager);

    const tools = registry.getToolDefinitions();
    assert.ok(tools.some((t) => t.function.name === 'ag_createCheckpoint'));
    assert.ok(tools.some((t) => t.function.name === 'ag_rollbackToCheckpoint'));
    assert.ok(tools.some((t) => t.function.name === 'ag_listCheckpoints'));

    // Execute ag_createCheckpoint
    const createRes = await registry.executeTool('ag_createCheckpoint', { label: 'Automated Tool Checkpoint' });
    assert.ok(createRes.includes('Successfully created checkpoint'));
    assert.ok(manager.getActiveCheckpoint());

    // Execute mutation through FileTools
    setMockFile('/mock/workspace/src/auto.ts', 'before edit');
    const writeRes = await registry.executeTool('ag_writeFile', { path: 'src/auto.ts', content: 'after edit' });
    assert.ok(writeRes.includes('Successfully wrote'));

    // Execute ag_listCheckpoints
    const listRes = await registry.executeTool('ag_listCheckpoints', {});
    const parsedList = JSON.parse(listRes);
    assert.strictEqual(parsedList.length, 1);
    assert.strictEqual(parsedList[0].label, 'Automated Tool Checkpoint');

    // Execute ag_rollbackToCheckpoint
    const rollbackRes = await registry.executeTool('ag_rollbackToCheckpoint', {});
    const parsedRollback = JSON.parse(rollbackRes);
    assert.strictEqual(parsedRollback.status, 'success');
    assert.deepStrictEqual(parsedRollback.restoredFiles, ['src/auto.ts']);
    assert.strictEqual(getMockFile('/mock/workspace/src/auto.ts'), 'before edit');
  });
});

