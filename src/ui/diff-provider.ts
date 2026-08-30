/**
 * AG Universal AI — Interactive Diff Provider
 *
 * Provides in-memory virtual documents for side-by-side diff previews
 * (using vscode.diff) before applying modifications to disk.
 */

import * as vscode from 'vscode';
import * as path from 'path';

export const DIFF_SCHEME = 'ag-diff';

export class AGDiffProvider implements vscode.TextDocumentContentProvider, vscode.Disposable {
  private static instance: AGDiffProvider;
  private readonly _onDidChange = new vscode.EventEmitter<vscode.Uri>();
  public readonly onDidChange = this._onDidChange.event;
  private contentMap = new Map<string, string>();
  private disposables: vscode.Disposable[] = [];

  constructor() {
    AGDiffProvider.instance = this;
  }

  public static getInstance(): AGDiffProvider {
    return AGDiffProvider.instance;
  }

  public register(context: vscode.ExtensionContext): void {
    const registration = vscode.workspace.registerTextDocumentContentProvider(DIFF_SCHEME, this);
    context.subscriptions.push(registration);
    this.disposables.push(registration);
  }

  public provideTextDocumentContent(uri: vscode.Uri): string {
    return this.contentMap.get(uri.path) || '';
  }

  /**
   * Show side-by-side interactive diff for a file before applying changes.
   */
  public async showDiff(
    filePath: string,
    proposedContent: string,
    title?: string
  ): Promise<void> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      vscode.window.showErrorMessage('Cannot open diff: No workspace folder open.');
      return;
    }

    const cleanPath = filePath.replace(/^[/\\]+/, '');
    const originalUri = vscode.Uri.joinPath(workspaceFolders[0].uri, cleanPath);

    // Create virtual proposed URI
    const virtualPath = `/${cleanPath}`;
    this.contentMap.set(virtualPath, proposedContent);

    const proposedUri = vscode.Uri.from({
      scheme: DIFF_SCHEME,
      path: virtualPath,
    });

    this._onDidChange.fire(proposedUri);

    const diffTitle = title || `AG AI: ${path.basename(filePath)} (Workspace ↔ Proposed)`;

    await vscode.commands.executeCommand(
      'vscode.diff',
      originalUri,
      proposedUri,
      diffTitle,
      { preview: true }
    );
  }

  public dispose(): void {
    this._onDidChange.dispose();
    for (const d of this.disposables) {
      d.dispose();
    }
  }
}
