/**
 * AG Universal AI — Workspace Checkpoint & Rollback Engine
 *
 * Implements a lightweight Copy-on-Write (CoW) snapshot mechanism.
 * Automatically captures files before mutations occur during agent executions,
 * allowing developers to revert all modifications with a single click.
 */

import * as vscode from 'vscode';
import * as path from 'path';

export interface CheckpointFileSnapshot {
  filePath: string;
  originalContent: string | null; // null if the file was created during this checkpoint
  existedBefore: boolean;
  capturedAt: number;
}

export interface Checkpoint {
  id: string;
  label: string;
  timestamp: number;
  files: Map<string, CheckpointFileSnapshot>;
  status: 'active' | 'completed' | 'reverted';
  source: 'agent' | 'user';
  restoredAt?: number;
}

export interface CheckpointSummary {
  id: string;
  label: string;
  timestamp: number;
  filesCount: number;
  files: string[];
  status: 'active' | 'completed' | 'reverted';
  source: 'agent' | 'user';
  restoredAt?: number;
}

export interface CheckpointDiffItem {
  filePath: string;
  originalContent: string;
  currentContent: string;
  status: 'modified' | 'added' | 'deleted';
}

export interface RollbackResult {
  checkpointId: string;
  restoredFiles: string[];
  deletedFiles: string[];
  errors: Array<{ filePath: string; error: string }>;
  success: boolean;
}

export class CheckpointManager implements vscode.Disposable {
  private checkpoints = new Map<string, Checkpoint>();
  private activeCheckpointId: string | undefined;
  private readonly maxCheckpoints = 20;
  private _onDidChangeCheckpoints = new vscode.EventEmitter<void>();
  public readonly onDidChangeCheckpoints = this._onDidChangeCheckpoints.event;

  constructor(
    private readonly outputChannel?: vscode.OutputChannel,
    private readonly storageUri?: vscode.Uri
  ) {}

  private log(message: string): void {
    if (this.outputChannel) {
      this.outputChannel.appendLine(`[CheckpointManager] ${message}`);
    }
  }

  /**
   * Normalizes a file path to relative workspace representation.
   */
  public normalizePath(filePath: string): string {
    const cleanPath = filePath.replace(/\\/g, '/').trim();
    const wf = vscode.workspace.workspaceFolders;
    if (!wf || wf.length === 0) {
      return cleanPath;
    }

    for (const folder of wf) {
      const rootPath = folder.uri.path.replace(/\\/g, '/');
      if (cleanPath.startsWith(rootPath + '/')) {
        return cleanPath.slice(rootPath.length + 1);
      }
    }
    return cleanPath;
  }

  /**
   * Resolves a workspace relative path to a vscode.Uri.
   */
  public resolveUri(filePath: string): vscode.Uri | undefined {
    const wf = vscode.workspace.workspaceFolders;
    if (!wf || wf.length === 0) {
      return undefined;
    }
    const clean = filePath.replace(/\\/g, '/').trim();
    if (path.posix.isAbsolute(clean)) {
      return vscode.Uri.file(clean);
    }
    return vscode.Uri.joinPath(wf[0].uri, clean);
  }

  /**
   * Create and activate a new checkpoint session.
   * If a previous checkpoint was active, it will be marked as completed.
   */
  public createCheckpoint(label: string, source: 'agent' | 'user' = 'agent'): Checkpoint {
    if (this.activeCheckpointId) {
      const prev = this.checkpoints.get(this.activeCheckpointId);
      if (prev && prev.status === 'active') {
        prev.status = 'completed';
      }
    }

    const id = `ckpt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const checkpoint: Checkpoint = {
      id,
      label,
      timestamp: Date.now(),
      files: new Map(),
      status: 'active',
      source,
    };

    // Keep capacity bounded to maxCheckpoints
    if (this.checkpoints.size >= this.maxCheckpoints) {
      const oldestKey = this.checkpoints.keys().next().value;
      if (oldestKey) {
        this.checkpoints.delete(oldestKey);
      }
    }

    this.checkpoints.set(id, checkpoint);
    this.activeCheckpointId = id;
    this.log(`Created active checkpoint: ${id} ("${label}")`);
    this._onDidChangeCheckpoints.fire();
    return checkpoint;
  }

  /**
   * Complete the currently active checkpoint.
   */
  public completeCheckpoint(checkpointId?: string): void {
    const targetId = checkpointId || this.activeCheckpointId;
    if (!targetId) {
      return;
    }

    const ckpt = this.checkpoints.get(targetId);
    if (ckpt && ckpt.status === 'active') {
      ckpt.status = 'completed';
      if (this.activeCheckpointId === targetId) {
        this.activeCheckpointId = undefined;
      }
      this.log(`Completed checkpoint: ${targetId} (${ckpt.files.size} files snapshotted)`);
      this._onDidChangeCheckpoints.fire();
    }
  }

  /**
   * Get the currently active checkpoint, if any.
   */
  public getActiveCheckpoint(): Checkpoint | undefined {
    if (!this.activeCheckpointId) {
      return undefined;
    }
    return this.checkpoints.get(this.activeCheckpointId);
  }

  /**
   * Get the most recent checkpoint (active or completed).
   */
  public getLastCheckpoint(): Checkpoint | undefined {
    const all = Array.from(this.checkpoints.values());
    if (all.length === 0) {
      return undefined;
    }
    return all[all.length - 1];
  }

  /**
   * Copy-on-Write hook: Captures original file state before any mutation occurs.
   * If the file was already captured in the active checkpoint, this is a no-op (preserves original base).
   */
  public async captureFileBeforeMutation(filePath: string): Promise<void> {
    const active = this.getActiveCheckpoint();
    if (!active || active.status !== 'active') {
      return;
    }

    const norm = this.normalizePath(filePath);
    if (active.files.has(norm)) {
      // Already captured at the start of this checkpoint (Copy-on-Write idempotency)
      return;
    }

    const uri = this.resolveUri(norm);
    if (!uri) {
      return;
    }

    try {
      // Check if file exists on disk
      await vscode.workspace.fs.stat(uri);
      const data = await vscode.workspace.fs.readFile(uri);
      const content = new TextDecoder().decode(data);

      active.files.set(norm, {
        filePath: norm,
        originalContent: content,
        existedBefore: true,
        capturedAt: Date.now(),
      });
      this.log(`Captured existing file snapshot: ${norm} (${content.length} chars)`);
    } catch {
      // File does not exist yet; will be newly created
      active.files.set(norm, {
        filePath: norm,
        originalContent: null,
        existedBefore: false,
        capturedAt: Date.now(),
      });
      this.log(`Captured new file target snapshot: ${norm} (does not exist on disk)`);
    }

    this._onDidChangeCheckpoints.fire();
  }

  /**
   * Rollback workspace changes to the specified checkpoint (or the last completed/active checkpoint).
   */
  public async rollbackCheckpoint(checkpointId?: string): Promise<RollbackResult> {
    const target = checkpointId
      ? this.checkpoints.get(checkpointId)
      : this.getLastCheckpoint();

    if (!target) {
      return {
        checkpointId: checkpointId || 'none',
        restoredFiles: [],
        deletedFiles: [],
        errors: [{ filePath: '', error: 'No checkpoint found to rollback.' }],
        success: false,
      };
    }

    const restoredFiles: string[] = [];
    const deletedFiles: string[] = [];
    const errors: Array<{ filePath: string; error: string }> = [];

    for (const [normPath, snapshot] of target.files.entries()) {
      const uri = this.resolveUri(normPath);
      if (!uri) {
        errors.push({ filePath: normPath, error: 'Could not resolve workspace URI.' });
        continue;
      }

      try {
        if (snapshot.existedBefore && snapshot.originalContent !== null) {
          // Restore original file content
          const encoder = new TextEncoder();
          await vscode.workspace.fs.writeFile(uri, encoder.encode(snapshot.originalContent));
          restoredFiles.push(normPath);
          this.log(`Restored: ${normPath}`);
        } else if (!snapshot.existedBefore) {
          // Delete file created by the agent
          try {
            await vscode.workspace.fs.delete(uri, { recursive: false, useTrash: false });
            deletedFiles.push(normPath);
            this.log(`Deleted newly created file: ${normPath}`);
          } catch (delErr: unknown) {
            // If already deleted or missing, treat as success
            const msg = delErr instanceof Error ? delErr.message : String(delErr);
            if (!msg.includes('not found') && !msg.includes('FileNotFound')) {
              errors.push({ filePath: normPath, error: msg });
            } else {
              deletedFiles.push(normPath);
            }
          }
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push({ filePath: normPath, error: msg });
        this.log(`Error rolling back ${normPath}: ${msg}`);
      }
    }

    target.status = 'reverted';
    target.restoredAt = Date.now();
    if (this.activeCheckpointId === target.id) {
      this.activeCheckpointId = undefined;
    }

    this.log(`Rollback completed for ${target.id}: ${restoredFiles.length} restored, ${deletedFiles.length} deleted, ${errors.length} errors.`);
    this._onDidChangeCheckpoints.fire();

    return {
      checkpointId: target.id,
      restoredFiles,
      deletedFiles,
      errors,
      success: errors.length === 0,
    };
  }

  /**
   * Get diff between original checkpoint content and current workspace state.
   */
  public async getCheckpointDiff(checkpointId?: string): Promise<CheckpointDiffItem[]> {
    const target = checkpointId ? this.checkpoints.get(checkpointId) : this.getLastCheckpoint();
    if (!target) {
      return [];
    }

    const diffs: CheckpointDiffItem[] = [];

    for (const [normPath, snapshot] of target.files.entries()) {
      const uri = this.resolveUri(normPath);
      let currentContent = '';
      let existsNow = false;

      if (uri) {
        try {
          const data = await vscode.workspace.fs.readFile(uri);
          currentContent = new TextDecoder().decode(data);
          existsNow = true;
        } catch {
          existsNow = false;
        }
      }

      const orig = snapshot.originalContent || '';

      if (!snapshot.existedBefore && existsNow) {
        diffs.push({
          filePath: normPath,
          originalContent: '',
          currentContent,
          status: 'added',
        });
      } else if (snapshot.existedBefore && !existsNow) {
        diffs.push({
          filePath: normPath,
          originalContent: orig,
          currentContent: '',
          status: 'deleted',
        });
      } else if (orig !== currentContent) {
        diffs.push({
          filePath: normPath,
          originalContent: orig,
          currentContent,
          status: 'modified',
        });
      }
    }

    return diffs;
  }

  /**
   * List all checkpoints in reverse chronological order (newest first).
   */
  public listCheckpoints(): CheckpointSummary[] {
    const list: CheckpointSummary[] = [];
    for (const ckpt of this.checkpoints.values()) {
      list.push({
        id: ckpt.id,
        label: ckpt.label,
        timestamp: ckpt.timestamp,
        filesCount: ckpt.files.size,
        files: Array.from(ckpt.files.keys()),
        status: ckpt.status,
        source: ckpt.source,
        restoredAt: ckpt.restoredAt,
      });
    }
    return list.reverse();
  }

  /**
   * Get a specific checkpoint by ID.
   */
  public getCheckpoint(id: string): Checkpoint | undefined {
    return this.checkpoints.get(id);
  }

  /**
   * Delete a specific checkpoint.
   */
  public deleteCheckpoint(id: string): boolean {
    const existed = this.checkpoints.delete(id);
    if (this.activeCheckpointId === id) {
      this.activeCheckpointId = undefined;
    }
    if (existed) {
      this._onDidChangeCheckpoints.fire();
    }
    return existed;
  }

  /**
   * Clear all checkpoints.
   */
  public clearAll(): void {
    this.checkpoints.clear();
    this.activeCheckpointId = undefined;
    this._onDidChangeCheckpoints.fire();
  }

  public dispose(): void {
    this.clearAll();
    this._onDidChangeCheckpoints.dispose();
  }
}
