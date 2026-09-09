/**
 * AG Universal AI — Terminal Tools
 *
 * Execute shell commands in the workspace and capture output.
 */

import * as vscode from 'vscode';
import { exec } from 'child_process';
import * as path from 'path';

const MAX_OUTPUT_LENGTH = 8000;
const DEFAULT_TIMEOUT_MS = 30000;

export class TerminalTools {
  constructor(private readonly outputChannel: vscode.OutputChannel) {}

  /**
   * Run a command in the workspace and return stdout/stderr.
   */
  async runCommand(command: string, cwd?: string): Promise<string> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      return 'Error: No workspace folder open.';
    }

    const workspaceRoot = workspaceFolders[0].uri;
    let workingDir = workspaceRoot.fsPath;

    if (cwd && cwd.trim()) {
      const cleanCwd = cwd.trim().replace(/^[/\\]+/, '');
      const candidateUri = vscode.Uri.joinPath(workspaceRoot, cleanCwd);

      // Confinement check: ensure cwd stays within workspaceRoot
      const rootPath = path.posix.normalize(workspaceRoot.fsPath.replace(/\\/g, '/')).toLowerCase().replace(/\/$/, '');
      const targetPath = path.posix.normalize(candidateUri.fsPath.replace(/\\/g, '/')).toLowerCase();

      if (targetPath !== rootPath && !targetPath.startsWith(rootPath + '/')) {
        this.log(`Path traversal attempt blocked: cwd "${cwd}" resolves outside workspace`);
        return `Error: Working directory "${cwd}" resolves outside the active workspace. Execution blocked.`;
      }
      workingDir = candidateUri.fsPath;
    }

    // Security: basic command sanitization
    if (this.isDangerous(command)) {
      return `Error: Command blocked for safety. Potentially destructive command detected: "${command}"`;
    }

    this.log(`Running: ${command} (cwd: ${workingDir})`);

    return new Promise((resolve) => {
      exec(
        command,
        {
          cwd: workingDir,
          timeout: DEFAULT_TIMEOUT_MS,
          maxBuffer: 1024 * 1024, // 1MB
          shell: process.platform === 'win32' ? 'powershell.exe' : '/bin/bash',
        },
        (error, stdout, stderr) => {
          const parts: string[] = [];

          parts.push(`$ ${command}\n`);

          if (stdout) {
            const trimmedStdout =
              stdout.length > MAX_OUTPUT_LENGTH
                ? stdout.substring(0, MAX_OUTPUT_LENGTH) + '\n... (output truncated)'
                : stdout;
            parts.push(`stdout:\n${trimmedStdout}`);
          }

          if (stderr) {
            const trimmedStderr =
              stderr.length > MAX_OUTPUT_LENGTH
                ? stderr.substring(0, MAX_OUTPUT_LENGTH) + '\n... (output truncated)'
                : stderr;
            parts.push(`stderr:\n${trimmedStderr}`);
          }

          if (error) {
            parts.push(`Exit code: ${error.code || 1}`);
            if (error.killed) {
              parts.push('Process was killed (timeout or signal).');
            }
          } else {
            parts.push('Exit code: 0 (success)');
          }

          resolve(parts.join('\n'));
        }
      );
    });
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  /**
   * Basic safety check for potentially destructive commands.
   */
  private isDangerous(command: string): boolean {
    const lower = command.toLowerCase().trim();
    const dangerous = [
      'rm -rf /',
      'rm -rf *',
      'format c:',
      'del /s /q c:',
      'rmdir /s /q c:',
      'del /f /s /q',
      'mkfs',
      ':(){:|:&};:',
      'dd if=/dev/zero',
      'shutdown',
      'reboot',
      'halt',
      'init 0',
    ];
    return dangerous.some((d) => lower.includes(d));
  }

  private log(message: string): void {
    this.outputChannel.appendLine(`[TerminalTools] ${message}`);
  }
}
