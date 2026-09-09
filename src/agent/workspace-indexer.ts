/**
 * AG Universal AI — Workspace Context Indexer
 *
 * Scans active workspace topology, ignores noisy build/cache directories,
 * and produces a high-density, token-efficient digest for agent reasoning.
 */

import * as vscode from 'vscode';
import * as path from 'path';

export interface WorkspaceDigest {
  rootName: string;
  totalFiles: number;
  filesByCategory: Record<string, string[]>;
  summaryText: string;
}

const IGNORE_PATTERNS = [
  '**/node_modules/**',
  '**/.git/**',
  '**/dist/**',
  '**/out/**',
  '**/.vscode/**',
  '**/*.vsix',
  '**/*.lock',
  '**/package-lock.json',
  '**/yarn.lock',
  '**/.DS_Store',
  '**/coverage/**',
];

export class WorkspaceIndexer {
  /**
   * Produce a compact, high-value textual digest of the workspace layout.
   */
  public static async getWorkspaceDigest(maxFiles = 60): Promise<WorkspaceDigest> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      return {
        rootName: 'No Workspace',
        totalFiles: 0,
        filesByCategory: {},
        summaryText: 'No workspace folder currently open.',
      };
    }

    const rootFolder = workspaceFolders[0];
    const rootName = rootFolder.name;

    try {
      const includePattern = '**/*';
      const excludePattern = `{${IGNORE_PATTERNS.join(',')}}`;

      const uris = await vscode.workspace.findFiles(includePattern, excludePattern, maxFiles * 2);

      const filesByCategory: Record<string, string[]> = {
        source: [],
        configs: [],
        docs: [],
        other: [],
      };

      for (const uri of uris) {
        const relPath = vscode.workspace.asRelativePath(uri);
        const ext = path.extname(relPath).toLowerCase();

        if (['.ts', '.js', '.tsx', '.jsx', '.py', '.rs', '.go', '.java', '.cs', '.cpp', '.c'].includes(ext)) {
          filesByCategory.source.push(relPath);
        } else if (['.json', '.yaml', '.yml', '.toml', '.env', '.mjs'].includes(ext)) {
          filesByCategory.configs.push(relPath);
        } else if (['.md', '.txt', '.rst'].includes(ext)) {
          filesByCategory.docs.push(relPath);
        } else {
          filesByCategory.other.push(relPath);
        }
      }

      const totalFound = uris.length;

      const lines: string[] = [
        `📁 Workspace: "${rootName}" (${totalFound} relevant files detected)`,
        '',
        `💻 Source Code (${filesByCategory.source.length}):`,
        ...filesByCategory.source.slice(0, 30).map((f) => `  - ${f}`),
        ...(filesByCategory.source.length > 30 ? [`  ... (${filesByCategory.source.length - 30} more)`] : []),
        '',
        `⚙️ Configurations (${filesByCategory.configs.length}):`,
        ...filesByCategory.configs.slice(0, 15).map((f) => `  - ${f}`),
        '',
        `📖 Documentation (${filesByCategory.docs.length}):`,
        ...filesByCategory.docs.slice(0, 10).map((f) => `  - ${f}`),
      ];

      return {
        rootName,
        totalFiles: totalFound,
        filesByCategory,
        summaryText: lines.join('\n'),
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        rootName,
        totalFiles: 0,
        filesByCategory: {},
        summaryText: `Error indexing workspace: ${msg}`,
      };
    }
  }
}
