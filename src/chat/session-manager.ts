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
      const storedSessions = this.workspaceState.get<any[]>(STORAGE_KEY, []);
      if (Array.isArray(storedSessions)) {
        this.sessions = storedSessions.map((s) => this.sanitizeSession(s));
      } else {
        this.sessions = [];
      }
      this.activeSessionId = this.workspaceState.get<string>(ACTIVE_SESSION_KEY, undefined);

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

  private sanitizeSession(raw: any): ChatSession {
    const id = typeof raw.id === 'string' && raw.id ? raw.id : `session_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const title = typeof raw.title === 'string' && raw.title ? raw.title : 'New Chat';
    const createdAt = typeof raw.createdAt === 'number' ? raw.createdAt : Date.now();
    const updatedAt = typeof raw.updatedAt === 'number' ? raw.updatedAt : Date.now();
    const rawMsgs = Array.isArray(raw.messages) ? raw.messages : [];

    const messages = rawMsgs.map((m: any) => {
      let contentStr: string;
      if (typeof m.content === 'string') {
        contentStr = m.content;
      } else if (Array.isArray(m.content)) {
        contentStr = m.content
          .map((c: any) => (typeof c === 'string' ? c : c?.text || ''))
          .filter(Boolean)
          .join(' ');
      } else {
        contentStr = String(m.content || '');
      }

      return {
        id: typeof m.id === 'string' ? m.id : `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        role: (m.role === 'user' || m.role === 'assistant' || m.role === 'system' ? m.role : 'user') as 'user' | 'assistant' | 'system',
        content: contentStr,
        timestamp: typeof m.timestamp === 'number' ? m.timestamp : Date.now(),
        providerId: typeof m.providerId === 'string' ? m.providerId : undefined,
        model: typeof m.model === 'string' ? m.model : undefined,
      };
    });

    return {
      id,
      title,
      createdAt,
      updatedAt,
      providerId: typeof raw.providerId === 'string' ? raw.providerId : undefined,
      model: typeof raw.model === 'string' ? raw.model : undefined,
      messages,
    };
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
    let contentStr: string;
    if (typeof content === 'string') {
      contentStr = content;
    } else if (Array.isArray(content)) {
      contentStr = content
        .map((c: any) => (typeof c === 'string' ? c : c?.text || ''))
        .filter(Boolean)
        .join(' ');
    } else {
      contentStr = String(content || '');
    }

    session.messages.push({
      id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      role,
      content: contentStr,
      timestamp: Date.now(),
      providerId,
      model,
    });
    session.updatedAt = Date.now();
    if (providerId) {session.providerId = providerId;}
    if (model) {session.model = model;}

    // Auto-title session based on first user message if title is default
    if (role === 'user' && (session.title === 'New Chat' || session.title.startsWith('New Chat'))) {
      const cleanText = contentStr.trim().replace(/^[@/][a-zA-Z0-9_-]+\s*/, '');
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
