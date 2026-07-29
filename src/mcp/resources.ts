/**
 * AG Universal AI — MCP Resource Exposer
 *
 * Exposes workspace files and project metadata as MCP Resources.
 */

import * as vscode from 'vscode';

export interface MCPResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export async function getMCPResources(): Promise<MCPResource[]> {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    return [];
  }

  const resources: MCPResource[] = [
    {
      uri: 'ag://workspace/info',
      name: 'Workspace Information',
      description: 'Overview of workspace structure and active settings',
      mimeType: 'application/json',
    },
  ];

  try {
    const files = await vscode.workspace.findFiles('**/*', '**/node_modules/**,**/.git/**', 50);
    for (const file of files) {
      const relPath = vscode.workspace.asRelativePath(file);
      resources.push({
        uri: file.toString(),
        name: relPath,
        description: `Workspace file: ${relPath}`,
      });
    }
  } catch {
    // Return base info on error
  }

  return resources;
}
