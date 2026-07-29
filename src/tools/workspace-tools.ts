/**
 * AG Universal AI — Workspace Tools
 *
 * Tools for searching the workspace, getting editor selection,
 * and reading diagnostics (errors/warnings).
 */

import * as vscode from 'vscode';

export class WorkspaceTools {
  constructor(private readonly outputChannel: vscode.OutputChannel) {}

  /**
   * Search for text patterns across workspace files.
   */
  async searchWorkspace(
    query: string,
    includes?: string,
    maxResults: number = 20
  ): Promise<string> {
    try {
      const pattern = includes || '**/*';
      const exclude = '**/node_modules/**,**/.git/**,**/dist/**,**/*.min.*';

      // Use VS Code's built-in search
      const uris = await vscode.workspace.findFiles(pattern, exclude, 100);
      const results: string[] = [];
      let matchCount = 0;

      for (const uri of uris) {
        if (matchCount >= maxResults) {break;}

        try {
          const doc = await vscode.workspace.openTextDocument(uri);
          const text = doc.getText();
          const lines = text.split('\n');

          for (let i = 0; i < lines.length; i++) {
            if (matchCount >= maxResults) {break;}

            if (lines[i].includes(query)) {
              const relativePath = vscode.workspace.asRelativePath(uri);
              const lineNum = i + 1;
              const lineContent = lines[i].trim();
              const truncated =
                lineContent.length > 120
                  ? lineContent.substring(0, 117) + '...'
                  : lineContent;
              results.push(`${relativePath}:${lineNum}: ${truncated}`);
              matchCount++;
            }
          }
        } catch {
          // Skip files that can't be opened (binary, etc.)
        }
      }

      if (results.length === 0) {
        return `No matches found for "${query}" in workspace.`;
      }

      return `Found ${results.length} matches for "${query}":\n\n${results.join('\n')}`;
    } catch (err: unknown) {
      return `Error searching workspace: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  /**
   * Get the current text selection in the active editor.
   */
  getSelection(): string {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return 'No active editor.';
    }

    const selection = editor.selection;
    if (selection.isEmpty) {
      // Return the current line
      const line = editor.document.lineAt(selection.active.line);
      const relativePath = vscode.workspace.asRelativePath(editor.document.uri);
      return (
        `Current cursor at ${relativePath}:${selection.active.line + 1}:${selection.active.character + 1}\n` +
        `Language: ${editor.document.languageId}\n` +
        `Current line: ${line.text}`
      );
    }

    const selectedText = editor.document.getText(selection);
    const relativePath = vscode.workspace.asRelativePath(editor.document.uri);
    const startLine = selection.start.line + 1;
    const endLine = selection.end.line + 1;

    return (
      `Selection from ${relativePath} (lines ${startLine}-${endLine}):\n` +
      `Language: ${editor.document.languageId}\n` +
      `\`\`\`${editor.document.languageId}\n${selectedText}\n\`\`\``
    );
  }

  /**
   * Get diagnostics (errors, warnings) for a file or the workspace.
   */
  getDiagnostics(filePath?: string): string {
    let diagnostics: Array<[vscode.Uri, readonly vscode.Diagnostic[]]>;

    if (filePath) {
      const uri = this.resolveUri(filePath);
      if (!uri) {
        return `Error: Could not resolve path "${filePath}".`;
      }
      const fileDiagnostics = vscode.languages.getDiagnostics(uri);
      diagnostics = [[uri, fileDiagnostics]];
    } else {
      diagnostics = vscode.languages
        .getDiagnostics()
        .filter(([, diags]) => diags.length > 0);
    }

    if (diagnostics.length === 0 || diagnostics.every(([, d]) => d.length === 0)) {
      return filePath
        ? `No diagnostics for "${filePath}". File looks clean! ✅`
        : 'No diagnostics in the workspace. All clean! ✅';
    }

    const lines: string[] = [];
    let totalErrors = 0;
    let totalWarnings = 0;

    for (const [uri, diags] of diagnostics) {
      if (diags.length === 0) {continue;}

      const relativePath = vscode.workspace.asRelativePath(uri);
      lines.push(`\n📄 ${relativePath}:`);

      for (const diag of diags) {
        const icon = diag.severity === vscode.DiagnosticSeverity.Error ? '❌' : '⚠️';
        const type =
          diag.severity === vscode.DiagnosticSeverity.Error ? 'Error' : 'Warning';
        const line = diag.range.start.line + 1;
        const source = diag.source ? `[${diag.source}]` : '';

        lines.push(`  ${icon} Line ${line}: ${type} ${source} ${diag.message}`);

        if (diag.severity === vscode.DiagnosticSeverity.Error) {totalErrors++;}
        else {totalWarnings++;}
      }
    }

    const summary = `Diagnostics: ${totalErrors} errors, ${totalWarnings} warnings`;
    return `${summary}\n${lines.join('\n')}`;
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  private resolveUri(filePath: string): vscode.Uri | undefined {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      return undefined;
    }
    return vscode.Uri.joinPath(workspaceFolders[0].uri, filePath);
  }
}
