/**
 * AG Universal AI — Chat Session Manager
 *
 * Persists and orchestrates chat sessions across VS Code restarts
 * using Memento (workspaceState).
 */

import * as vscode from 'vscode';
import type { ChatSession } from '../providers/types';

const STORAGE_KEY = 'ag-universal-ai.chatSessions';
const ACTIVE_SESSION_KEY = 'ag-universal-ai.activeSessionId';

export class SessionManager implements vscode.Disposable {
  private sessions: ChatSession[] = [];
  private activeSessionId: string | undefined;
  private disposables: vscode.Disposable[] = [];

  private readonly _onDidChangeSession = new vscode.EventEmitter<ChatSession | undefined>();
  public readonly onDidChangeSession = this._onDidChangeSession.event;

  private readonly _onDidChangeSessionList = new vscode.EventEmitter<ChatSession[]>();
  public readonly onDidChangeSessionList = this._onDidChangeSessionList.event;

  constructor(private readonly workspaceState: vscode.Memento) {
    this.loadState();
  }

  /**
   * Load stored sessions from workspaceState.
   */
  private loadState(): void {
    try {
      const storedSessions = this.workspaceState.get<ChatSession[]>(STORAGE_KEY, []);
      this.sessions = Array.isArray(storedSessions) ? storedSessions : [];
      this.activeSessionId = this.workspaceState.get<string>(ACTIVE_SESSION_KEY, undefined);

      // Ensure active session exists or create one if list is empty
      if (this.sessions.length === 0) {
        this.createSession('New Chat');
      } else if (!this.activeSessionId || !this.sessions.some((s) => s.id === this.activeSessionId)) {
        this.activeSessionId = this.sessions[0].id;
      }
    } catch {
      this.sessions = [];
      this.createSession('New Chat');
    }
  }

  /**
   * Persist current state to workspaceState.
   */
  public async saveState(): Promise<void> {
    await this.workspaceState.update(STORAGE_KEY, this.sessions);
    await this.workspaceState.update(ACTIVE_SESSION_KEY, this.activeSessionId);
  }

  /**
   * Get all chat sessions sorted by updatedAt descending.
   */
  public getSessions(): ChatSession[] {
    return [...this.sessions].sort((a, b) => b.updatedAt - a.updatedAt);
  }

  /**
   * Get currently active chat session.
   */
  public getActiveSession(): ChatSession {
    let session = this.sessions.find((s) => s.id === this.activeSessionId);
    if (!session) {
      session = this.createSession('New Chat');
    }
    return session;
  }

  /**
   * Set active session by ID.
   */
  public async setActiveSession(id: string): Promise<ChatSession | undefined> {
    const target = this.sessions.find((s) => s.id === id);
    if (!target) {
      return undefined;
    }
    this.activeSessionId = target.id;
    await this.saveState();
    this._onDidChangeSession.fire(target);
    return target;
  }

  /**
   * Create a new chat session.
   */
  public createSession(title = 'New Chat', providerId?: string, model?: string): ChatSession {
    const now = Date.now();
    const newSession: ChatSession = {
      id: `session_${now}_${Math.random().toString(36).substring(2, 7)}`,
      title,
      createdAt: now,
      updatedAt: now,
      providerId,
      model,
      messages: [],
    };

    this.sessions.unshift(newSession);
    this.activeSessionId = newSession.id;
    this.saveState();
    this._onDidChangeSessionList.fire(this.getSessions());
    this._onDidChangeSession.fire(newSession);
    return newSession;
  }

  /**
   * Add a message to the currently active session.
   */
  public async addMessage(
    role: 'user' | 'assistant' | 'system',
    content: string | any,
    providerId?: string,
    model?: string
  ): Promise<ChatSession> {
    const session = this.getActiveSession();
    session.messages.push({ role, content });
    session.updatedAt = Date.now();
    if (providerId) {session.providerId = providerId;}
    if (model) {session.model = model;}

    // Auto-title session based on first user message if title is default
    if (role === 'user' && (session.title === 'New Chat' || session.title.startsWith('New Chat'))) {
      const userText = typeof content === 'string'
        ? content
        : (Array.isArray(content) ? content.map((c: any) => c.text || '').join(' ') : String(content));
      const cleanText = userText.trim().replace(/^[@/][a-zA-Z0-9_-]+\s*/, '');
      if (cleanText.length > 0) {
        session.title = cleanText.length > 32 ? cleanText.substring(0, 30) + '...' : cleanText;
      }
    }

    await this.saveState();
    this._onDidChangeSession.fire(session);
    this._onDidChangeSessionList.fire(this.getSessions());
    return session;
  }

  /**
   * Clear messages from the active session.
   */
  public async clearActiveMessages(): Promise<void> {
    const session = this.getActiveSession();
    session.messages = [];
    session.updatedAt = Date.now();
    await this.saveState();
    this._onDidChangeSession.fire(session);
  }

  /**
   * Delete a session by ID.
   */
  public async deleteSession(id: string): Promise<boolean> {
    const index = this.sessions.findIndex((s) => s.id === id);
    if (index === -1) {
      return false;
    }

    this.sessions.splice(index, 1);

    if (this.sessions.length === 0) {
      this.createSession('New Chat');
    } else if (this.activeSessionId === id) {
      this.activeSessionId = this.sessions[0].id;
    }

    await this.saveState();
    this._onDidChangeSessionList.fire(this.getSessions());
    this._onDidChangeSession.fire(this.getActiveSession());
    return true;
  }

  /**
   * Clear all sessions and start fresh.
   */
  public async clearAllSessions(): Promise<void> {
    this.sessions = [];
    this.createSession('New Chat');
    await this.saveState();
  }

  public dispose(): void {
    this._onDidChangeSession.dispose();
    this._onDidChangeSessionList.dispose();
    for (const d of this.disposables) {
      d.dispose();
    }
  }
}
