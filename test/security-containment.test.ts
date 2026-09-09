import * as assert from 'assert';
import { TerminalTools } from '../src/tools/terminal-tools';
import { WorkspaceTools } from '../src/tools/workspace-tools';

describe('Security & Path Confinement', () => {
  const outputChannel = {
    appendLine: () => {},
    dispose: () => {},
  } as any;

  let terminalTools: TerminalTools;
  let workspaceTools: WorkspaceTools;

  beforeEach(() => {
    terminalTools = new TerminalTools(outputChannel);
    workspaceTools = new WorkspaceTools(outputChannel);
  });

  it('should block terminal execution when cwd resolves outside workspace', async () => {
    const result = await terminalTools.runCommand('echo "test"', '../../outside-workspace');
    assert.ok(result.includes('resolves outside the active workspace'));
  });

  it('should block potentially dangerous commands in terminal', async () => {
    const result = await terminalTools.runCommand('rm -rf /');
    assert.ok(result.includes('Command blocked for safety'));
  });

  it('should block dangerous Windows wipe commands in terminal', async () => {
    const result = await terminalTools.runCommand('del /s /q c:');
    assert.ok(result.includes('Command blocked for safety'));
  });

  it('should return error when getDiagnostics resolves outside workspace', () => {
    const result = workspaceTools.getDiagnostics('../../etc/passwd');
    assert.ok(result.includes('Could not resolve path'));
  });
});
