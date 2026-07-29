/**
 * AG Universal AI — Terminal Tools
 *
 * Execute shell commands in the workspace and capture output.
 */

import * as vscode from 'vscode';
import { exec } from 'child_process';

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

    const workspaceRoot = workspaceFolders[0].uri.fsPath;
    const workingDir = cwd ? `${workspaceRoot}/${cwd}` : workspaceRoot;

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
      'format c:',
      'del /s /q c:',
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
