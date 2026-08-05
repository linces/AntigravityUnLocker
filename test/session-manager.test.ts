import assert from 'assert';
import { SessionManager } from '../src/chat/session-manager';

class MockMemento {
  private storage = new Map<string, any>();
  public get<T>(key: string, defaultValue?: T): T {
    return this.storage.has(key) ? this.storage.get(key) : (defaultValue as T);
  }
  public async update(key: string, value: any): Promise<void> {
    this.storage.set(key, value);
  }
}

describe('SessionManager', () => {
  let memento: MockMemento;
  let manager: SessionManager;

  beforeEach(() => {
    memento = new MockMemento();
    manager = new SessionManager(memento as any);
  });

  afterEach(() => {
    manager.dispose();
  });

  it('should initialize with a default "New Chat" session', () => {
    const active = manager.getActiveSession();
    assert.ok(active);
    assert.strictEqual(active.title, 'New Chat');
    assert.strictEqual(active.messages.length, 0);
  });

  it('should add user and assistant messages to active session and auto-title session', async () => {
    await manager.addMessage('user', 'Implement a new binary tree parser', 'openai', 'gpt-4o');
    let active = manager.getActiveSession();
    assert.strictEqual(active.messages.length, 1);
    assert.strictEqual(active.messages[0].content, 'Implement a new binary tree parser');
    assert.strictEqual(active.title, 'Implement a new binary tree pa...');

    await manager.addMessage('assistant', 'Here is the binary tree implementation...');
    active = manager.getActiveSession();
    assert.strictEqual(active.messages.length, 2);
  });

  it('should create new sessions and allow switching between them', async () => {
    const s1 = manager.getActiveSession();
    await manager.addMessage('user', 'Chat 1 topic');

    const s2 = manager.createSession('New Chat');
    await manager.addMessage('user', 'Chat 2 topic');

    assert.notStrictEqual(s1.id, s2.id);
    assert.strictEqual(manager.getActiveSession().id, s2.id);

    // Switch back to s1
    await manager.setActiveSession(s1.id);
    assert.strictEqual(manager.getActiveSession().id, s1.id);
    assert.strictEqual(manager.getActiveSession().messages[0].content, 'Chat 1 topic');
  });

  it('should delete session and switch to remaining session', async () => {
    const s1 = manager.getActiveSession();
    const s2 = manager.createSession('New Chat');

    assert.strictEqual(manager.getSessions().length, 2);
    assert.strictEqual(manager.getActiveSession().id, s2.id);

    await manager.deleteSession(s2.id);
    assert.strictEqual(manager.getSessions().length, 1);
    assert.strictEqual(manager.getActiveSession().id, s1.id);
  });
});
