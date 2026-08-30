import * as assert from 'assert';
import { EditTools } from '../src/tools/edit-tools';
import { setMockFile, getMockFile, mockFileStore } from './vscode-mock';

describe('Edit Tools', () => {
  const outputChannel = {
    appendLine: () => {},
    dispose: () => {},
  } as any;

  let editTools: EditTools;

  beforeEach(() => {
    mockFileStore.clear();
    editTools = new EditTools(outputChannel);
  });

  it('should replace a unique text block in a file', async () => {
    const initialCode = `function hello() {\n  console.log('old message');\n}`;
    setMockFile('/mock/workspace/src/hello.ts', initialCode);

    const result = await editTools.replaceInFile(
      'src/hello.ts',
      `console.log('old message');`,
      `console.log('new message');`
    );

    assert.ok(result.includes('Successfully replaced text block'));
    const updated = getMockFile('/mock/workspace/src/hello.ts');
    assert.strictEqual(updated, `function hello() {\n  console.log('new message');\n}`);
  });

  it('should return error if targetContent is not found', async () => {
    const initialCode = `const x = 10;`;
    setMockFile('/mock/workspace/src/test.ts', initialCode);

    const result = await editTools.replaceInFile(
      'src/test.ts',
      `const y = 20;`,
      `const y = 30;`
    );

    assert.ok(result.includes('Target content not found'));
  });

  it('should return error if targetContent is not unique (found multiple times)', async () => {
    const initialCode = `const a = 1;\nconst a = 1;\n`;
    setMockFile('/mock/workspace/src/dup.ts', initialCode);

    const result = await editTools.replaceInFile(
      'src/dup.ts',
      `const a = 1;`,
      `const a = 2;`
    );

    assert.ok(result.includes('found 2 times'));
  });

  it('should apply multiple non-contiguous replacements in a single file', async () => {
    const initialCode = `const first = 1;\nconst middle = 2;\nconst last = 3;`;
    setMockFile('/mock/workspace/src/multi.ts', initialCode);

    const result = await editTools.multiReplaceInFile('src/multi.ts', [
      { targetContent: 'const first = 1;', replacementContent: 'const first = 100;' },
      { targetContent: 'const last = 3;', replacementContent: 'const last = 300;' },
    ]);

    assert.ok(result.includes('Successfully applied 2 replacement chunk(s)'));
    const updated = getMockFile('/mock/workspace/src/multi.ts');
    assert.strictEqual(updated, `const first = 100;\nconst middle = 2;\nconst last = 300;`);
  });

  it('should block path traversal outside workspace', async () => {
    const result = await editTools.replaceInFile(
      '../../etc/passwd',
      'root:x',
      'hacked:x'
    );

    assert.ok(result.includes('Could not resolve path') || result.includes('outside workspace'));
  });
});
