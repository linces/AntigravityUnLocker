import assert from 'assert';
import { ProviderManager } from '../src/providers/provider-manager';

// Mock VS Code environment for unit testing ProviderManager
class MockOutputChannel {
  public appendLine(_msg: string): void {}
}

class MockSecretStorage {
  private secrets = new Map<string, string>();
  public async get(key: string): Promise<string | undefined> {
    return this.secrets.get(key);
  }
  public async store(key: string, value: string): Promise<void> {
    this.secrets.set(key, value);
  }
}

describe('ProviderManager', () => {
  let providerManager: ProviderManager;

  beforeEach(async () => {
    const mockContext: any = {
      secrets: new MockSecretStorage(),
      extensionPath: process.cwd(),
    };
    const mockOutput = new MockOutputChannel() as any;

    providerManager = new ProviderManager(mockContext, mockOutput);
    await providerManager.initialize();
  });

  afterEach(() => {
    providerManager.dispose();
  });

  it('should initialize with default active provider', () => {
    const activeId = providerManager.getActiveProviderId();
    assert.strictEqual(activeId, 'ollama-local');
    const active = providerManager.getActiveProvider();
    assert.ok(active);
    assert.strictEqual(active?.id, 'ollama-local');
    assert.strictEqual(active?.config.model, 'qwen2.5-coder:14b');
  });

  it('should switch active provider and load correct provider-specific default model', async () => {
    await providerManager.setActiveProvider('groq');
    assert.strictEqual(providerManager.getActiveProviderId(), 'groq');
    const groq = providerManager.getActiveProvider();
    assert.ok(groq);
    assert.strictEqual(groq?.config.model, 'llama-3.3-70b-versatile');

    // Switch to OpenAI
    await providerManager.setActiveProvider('openai');
    assert.strictEqual(providerManager.getActiveProviderId(), 'openai');
    const openai = providerManager.getActiveProvider();
    assert.ok(openai);
    assert.strictEqual(openai?.config.model, 'gpt-4o');

    // Switch back to Ollama and verify its model was NOT overwritten
    await providerManager.setActiveProvider('ollama-local');
    const ollama = providerManager.getActiveProvider();
    assert.strictEqual(ollama?.config.model, 'qwen2.5-coder:14b');
  });

  it('should set and isolate model changes per provider', async () => {
    await providerManager.setActiveProvider('openai');
    await providerManager.setModel('openai', 'gpt-4o-mini');

    const openai = providerManager.getProvider('openai');
    assert.strictEqual(openai?.config.model, 'gpt-4o-mini');

    // Check that groq model remains unchanged
    const groq = providerManager.getProvider('groq');
    assert.strictEqual(groq?.config.model, 'llama-3.3-70b-versatile');

    // Switch to groq and change its model
    await providerManager.setActiveProvider('groq');
    await providerManager.setModel('groq', 'mixtral-8x7b-32768');
    assert.strictEqual(groq?.config.model, 'mixtral-8x7b-32768');

    // Switch back to openai and verify its model is still gpt-4o-mini
    await providerManager.setActiveProvider('openai');
    assert.strictEqual(providerManager.getActiveProvider()?.config.model, 'gpt-4o-mini');
  });
});
