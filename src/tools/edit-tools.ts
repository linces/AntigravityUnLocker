/**
 * AG Universal AI — Edit Tools
 *
 * Precise file editing tools for replacing specific code blocks (substring matching)
 * without rewriting entire files.
 */

import * as vscode from 'vscode';
import * as path from 'path';

export interface ReplacementChunk {
  targetContent: string;
  replacementContent: string;
}

export class EditTools {
  constructor(private readonly outputChannel: vscode.OutputChannel) {}

  /**
   * Replace a specific target string in a file with replacement string.
   * Requires targetContent to be unique in the file.
   */
  async replaceInFile(
    filePath: string,
    targetContent: string,
    replacementContent: string
  ): Promise<string> {
    const uri = this.resolveUri(filePath);
    if (!uri) {
      return `Error: Could not resolve path "${filePath}". Is a workspace folder open?`;
    }

    try {
      const doc = await vscode.workspace.openTextDocument(uri);
      const fullText = doc.getText();

      const occurrences = fullText.split(targetContent).length - 1;
      if (occurrences === 0) {
        return `Error: Target content not found in "${filePath}". Ensure exact character-for-character matching.`;
      }
      if (occurrences > 1) {
        return `Error: Target content found ${occurrences} times in "${filePath}". Include more surrounding code context to make targetContent unique.`;
      }

      const updatedText = fullText.replace(targetContent, replacementContent);
      const encoder = new TextEncoder();
      await vscode.workspace.fs.writeFile(uri, encoder.encode(updatedText));

      this.log(`Successfully replaced text block in ${filePath}`);
      return `Successfully replaced text block in "${filePath}".`;
    } catch (err: unknown) {
      return `Error replacing text in "${filePath}": ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  /**
   * Apply multiple non-contiguous replacements in a single file.
   */
  async multiReplaceInFile(
    filePath: string,
    replacements: ReplacementChunk[]
  ): Promise<string> {
    const uri = this.resolveUri(filePath);
    if (!uri) {
      return `Error: Could not resolve path "${filePath}". Is a workspace folder open?`;
    }

    if (!replacements || replacements.length === 0) {
      return `Error: No replacements provided for "${filePath}".`;
    }

    try {
      const doc = await vscode.workspace.openTextDocument(uri);
      let updatedText = doc.getText();
      let appliedCount = 0;

      for (let i = 0; i < replacements.length; i++) {
        const { targetContent, replacementContent } = replacements[i];
        const occurrences = updatedText.split(targetContent).length - 1;

        if (occurrences === 0) {
          return `Error at replacement #${i + 1}: Target content not found in "${filePath}".`;
        }
        if (occurrences > 1) {
          return `Error at replacement #${i + 1}: Target content found ${occurrences} times in "${filePath}". Provide unique context.`;
        }

        updatedText = updatedText.replace(targetContent, replacementContent);
        appliedCount++;
      }

      const encoder = new TextEncoder();
      await vscode.workspace.fs.writeFile(uri, encoder.encode(updatedText));

      this.log(`Successfully applied ${appliedCount} replacement chunks to ${filePath}`);
      return `Successfully applied ${appliedCount} replacement chunk(s) to "${filePath}".`;
    } catch (err: unknown) {
      return `Error multi-replacing in "${filePath}": ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  private resolveUri(filePath: string): vscode.Uri | undefined {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      return undefined;
    }

    const workspaceRoot = workspaceFolders[0].uri;
    const resolved = path.posix.join(workspaceRoot.path, filePath);
    return workspaceRoot.with({ path: resolved });
  }

  private log(message: string): void {
    this.outputChannel.appendLine(`[EditTools] ${message}`);
  }
}
