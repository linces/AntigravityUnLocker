import * as assert from 'assert';
import { AGDiffProvider, DIFF_SCHEME } from '../src/ui/diff-provider';
import * as vscode from 'vscode';

describe('Diff Provider', () => {
  it('should store and provide virtual document content for diff preview', async () => {
    const diffProvider = new AGDiffProvider();
    const mockContext = {
      subscriptions: [],
    } as any;

    diffProvider.register(mockContext);

    await diffProvider.showDiff('src/example.ts', 'const x = 99;', 'Review Diff');

    const virtualUri = vscode.Uri.from({
      scheme: DIFF_SCHEME,
      path: '/src/example.ts',
    });

    const content = diffProvider.provideTextDocumentContent(virtualUri);
    assert.strictEqual(content, 'const x = 99;');
  });
});
