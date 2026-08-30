/**
 * AG Universal AI — File Tools
 *
 * File system tools for reading, writing, and listing files in the workspace.
 */

import * as vscode from 'vscode';
import * as path from 'path';

export class FileTools {
  constructor(private readonly outputChannel: vscode.OutputChannel) {}

  /**
   * Read file contents from the workspace.
   */
  async readFile(
    filePath: string,
    startLine?: number,
    endLine?: number
  ): Promise<string> {
    const uri = this.resolveUri(filePath);
    if (!uri) {
      return `Error: Could not resolve path "${filePath}". Is a workspace folder open?`;
    }

    try {
      const doc = await vscode.workspace.openTextDocument(uri);
      let content: string;

      if (startLine !== undefined && endLine !== undefined) {
        const start = Math.max(0, startLine - 1);
        const end = Math.min(doc.lineCount, endLine);
        const range = new vscode.Range(
          new vscode.Position(start, 0),
          new vscode.Position(end - 1, doc.lineAt(end - 1).text.length)
        );
        content = doc.getText(range);
        return `File: ${filePath} (lines ${startLine}-${endLine})\n\`\`\`${doc.languageId}\n${content}\n\`\`\``;
      }

      content = doc.getText();
      const totalLines = doc.lineCount;
      return `File: ${filePath} (${totalLines} lines, ${doc.languageId})\n\`\`\`${doc.languageId}\n${content}\n\`\`\``;
    } catch (err: unknown) {
      return `Error reading "${filePath}": ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  /**
   * Write content to a file in the workspace.
   */
  async writeFile(filePath: string, content: string): Promise<string> {
    const uri = this.resolveUri(filePath);
    if (!uri) {
      return `Error: Could not resolve path "${filePath}". Is a workspace folder open?`;
    }

    try {
      const encoder = new TextEncoder();
      const data = encoder.encode(content);
      await vscode.workspace.fs.writeFile(uri, data);

      const lineCount = content.split('\n').length;
      this.log(`Wrote ${lineCount} lines to ${filePath}`);
      return `Successfully wrote ${lineCount} lines to ${filePath}`;
    } catch (err: unknown) {
      return `Error writing "${filePath}": ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  /**
   * List files in a directory.
   */
  async listFiles(dirPath: string, recursive: boolean): Promise<string> {
    const uri = this.resolveUri(dirPath || '.');
    if (!uri) {
      return `Error: Could not resolve path "${dirPath}". Is a workspace folder open?`;
    }

    try {
      const entries = await vscode.workspace.fs.readDirectory(uri);
      const lines: string[] = [`Contents of ${dirPath || '.'}:\n`];

      // Sort: directories first, then files
      const sorted = entries.sort((a, b) => {
        if (a[1] === b[1]) {return a[0].localeCompare(b[0]);}
        return a[1] === vscode.FileType.Directory ? -1 : 1;
      });

      for (const [name, type] of sorted) {
        const icon = type === vscode.FileType.Directory ? '📁' : '📄';
        lines.push(`${icon} ${name}${type === vscode.FileType.Directory ? '/' : ''}`);

        if (recursive && type === vscode.FileType.Directory) {
          const subPath = dirPath ? `${dirPath}/${name}` : name;
          const subEntries = await this.listFilesRecursive(subPath, 1);
          lines.push(...subEntries);
        }
      }

      return lines.join('\n');
    } catch (err: unknown) {
      return `Error listing "${dirPath}": ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  private async listFilesRecursive(
    dirPath: string,
    depth: number,
    maxDepth: number = 3
  ): Promise<string[]> {
    if (depth >= maxDepth) {
      return [`${'  '.repeat(depth)}... (max depth reached)`];
    }

    const uri = this.resolveUri(dirPath);
    if (!uri) {return [];}

    try {
      const entries = await vscode.workspace.fs.readDirectory(uri);
      const lines: string[] = [];
      const indent = '  '.repeat(depth);

      for (const [name, type] of entries) {
        const icon = type === vscode.FileType.Directory ? '📁' : '📄';
        lines.push(`${indent}${icon} ${name}${type === vscode.FileType.Directory ? '/' : ''}`);

        if (type === vscode.FileType.Directory) {
          const subLines = await this.listFilesRecursive(
            `${dirPath}/${name}`,
            depth + 1,
            maxDepth
          );
          lines.push(...subLines);
        }
      }

      return lines;
    } catch {
      return [];
    }
  }

  public resolveUri(filePath: string): vscode.Uri | undefined {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      return undefined;
    }

    const workspaceRoot = workspaceFolders[0].uri;
    const cleanPath = filePath.replace(/^[/\\]+/, '');
    const uri = vscode.Uri.joinPath(workspaceRoot, cleanPath);

    // Confinement check: ensure the resolved path stays within workspaceRoot
    const rootPath = path.posix.normalize(workspaceRoot.fsPath.replace(/\\/g, '/')).toLowerCase().replace(/\/$/, '');
    const targetPath = path.posix.normalize(uri.fsPath.replace(/\\/g, '/')).toLowerCase();
    if (targetPath !== rootPath && !targetPath.startsWith(rootPath + '/')) {
      this.log(`Path traversal attempt blocked: "${filePath}" resolves outside workspace`);
      return undefined;
    }

    return uri;
  }

  private log(message: string): void {
    this.outputChannel.appendLine(`[FileTools] ${message}`);
  }
}
