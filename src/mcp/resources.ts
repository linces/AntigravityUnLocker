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
    {
      uri: 'domain://dev/projects_registry',
      name: '[dev] Transversal Domain — Project Registry (SSOT)',
      description: 'Single Source of Truth mapping all projects, paths, stacks, and domain bindings',
      mimeType: 'text/yaml',
    },
    {
      uri: 'domain://dev/health_report',
      name: '[dev] Transversal Domain — Health Report',
      description: 'Latest Domain Evolution Engine health metrics and scores across all domains',
      mimeType: 'text/markdown',
    },
    {
      uri: 'domain://dev/knowledge/vscode_extension_resilience',
      name: '[dev] Knowledge Base — VS Code Extension Resilience & Telemetry',
      description: 'Architectural specifications, gotchas, and resilience patterns for VS Code extensions',
      mimeType: 'text/markdown',
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
