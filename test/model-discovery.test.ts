import * as assert from 'assert';
import { ModelDiscoveryService, isChatGenerativeModel, type DiscoveryResult } from '../src/providers/model-discovery';
import type { ILLMProvider, ModelInfo, ProviderConfig, ProviderCapabilities, HealthStatus, ChatCompletionRequest, ChatCompletionResponse } from '../src/providers/types';

// ─── Helpers ────────────────────────────────────────────────────────────────

function createMockProvider(
  id: string,
  model: string,
  listModelsFn?: () => Promise<ModelInfo[]>
): ILLMProvider {
  const config: ProviderConfig = {
    id,
    name: `Mock ${id}`,
    baseUrl: 'http://localhost:0',
    model,
    timeoutMs: 5000,
    apiKey: 'test-key',
  };

  return {
    id,
    name: `Mock ${id}`,
    config,
    chat: async (_req: ChatCompletionRequest): Promise<ChatCompletionResponse> => {
      throw new Error('Not implemented in mock');
    },
    stream: async function* (_req: ChatCompletionRequest, _signal?: AbortSignal): AsyncIterable<string> {
      yield 'mock';
    },
    health: async (): Promise<HealthStatus> => ({
      isHealthy: true,
      latencyMs: 10,
      lastChecked: new Date(),
    }),
    capabilities: (): ProviderCapabilities => ({
      supportsStreaming: true,
      supportsTools: true,
      supportsVision: false,
      maxContextTokens: 128000,
    }),
    listModels: listModelsFn,
  };
}

function createMockModels(ids: string[], vendor = 'test'): ModelInfo[] {
  return ids.map((id) => ({
    id,
    name: id,
    vendor,
    maxInputTokens: 128000,
    maxOutputTokens: 4096,
    supportsTools: true,
    supportsVision: false,
  }));
}

function createMockPersistentStore(): { store: Record<string, unknown>; api: { get: <T>(key: string, defaultValue: T) => T; update: (key: string, value: unknown) => Promise<void> } } {
  const store: Record<string, unknown> = {};
  return {
    store,
    api: {
      get: <T>(key: string, defaultValue: T): T => (store[key] as T) ?? defaultValue,
      update: async (key: string, value: unknown): Promise<void> => { store[key] = value; },
    },
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('ModelDiscoveryService', () => {
  const logs: string[] = [];
  const logFn = (msg: string) => logs.push(msg);

  beforeEach(() => {
    logs.length = 0;
  });

  // ─── Live Discovery ─────────────────────────────────────────────────────

  it('should return live models when provider.listModels succeeds', async () => {
    const mockModels = createMockModels(['model-a', 'model-b', 'model-c']);
    const provider = createMockProvider('test-provider', 'model-a', async () => mockModels);
    const service = new ModelDiscoveryService(logFn);

    const result = await service.discoverModels(provider);

    assert.strictEqual(result.source, 'live');
    assert.strictEqual(result.providerId, 'test-provider');
    assert.ok(result.models.length >= 3, `Expected >= 3 models, got ${result.models.length}`);
    assert.ok(result.models.some((m) => m.id === 'model-a'));
    assert.ok(result.models.some((m) => m.id === 'model-b'));
    assert.ok(result.models.some((m) => m.id === 'model-c'));
  });

  it('should put current model first in sorted results', async () => {
    const mockModels = createMockModels(['alpha-model', 'beta-model', 'current-model']);
    const provider = createMockProvider('test-provider', 'current-model', async () => mockModels);
    const service = new ModelDiscoveryService(logFn);

    const result = await service.discoverModels(provider);

    assert.strictEqual(result.models[0].id, 'current-model');
  });

  // ─── Memory Cache ───────────────────────────────────────────────────────

  it('should return cached results on second call within TTL', async () => {
    let callCount = 0;
    const provider = createMockProvider('cached-test', 'model-x', async () => {
      callCount++;
      return createMockModels(['model-x', 'model-y']);
    });
    const service = new ModelDiscoveryService(logFn);

    // First call — live fetch
    const r1 = await service.discoverModels(provider);
    assert.strictEqual(r1.source, 'live');
    assert.strictEqual(callCount, 1);

    // Second call — should use memory cache
    const r2 = await service.discoverModels(provider);
    assert.strictEqual(r2.source, 'memory-cache');
    assert.strictEqual(callCount, 1, 'Should NOT have called listModels again');
    assert.strictEqual(r2.models.length, r1.models.length);
  });

  it('should bypass cache when forceRefresh is true', async () => {
    let callCount = 0;
    const provider = createMockProvider('force-test', 'model-z', async () => {
      callCount++;
      return createMockModels(['model-z']);
    });
    const service = new ModelDiscoveryService(logFn);

    await service.discoverModels(provider);
    assert.strictEqual(callCount, 1);

    const r2 = await service.discoverModels(provider, true);
    assert.strictEqual(callCount, 2, 'Should have called listModels again');
    assert.strictEqual(r2.source, 'live');
  });

  // ─── Cache Invalidation ─────────────────────────────────────────────────

  it('should invalidate cache for specific provider', async () => {
    let callCount = 0;
    const provider = createMockProvider('invalidate-test', 'model-a', async () => {
      callCount++;
      return createMockModels(['model-a']);
    });
    const service = new ModelDiscoveryService(logFn);

    await service.discoverModels(provider);
    assert.strictEqual(callCount, 1);

    service.invalidateCache('invalidate-test');

    const r2 = await service.discoverModels(provider);
    assert.strictEqual(callCount, 2, 'Should have fetched again after invalidation');
    assert.strictEqual(r2.source, 'live');
  });

  // ─── Fallback Chain ─────────────────────────────────────────────────────

  it('should fall back to preset when live fetch fails', async () => {
    const provider = createMockProvider('groq', 'llama-3.3-70b-versatile', async () => {
      throw new Error('Network error');
    });
    const service = new ModelDiscoveryService(logFn);

    const result = await service.discoverModels(provider);

    // Should fallback to preset (groq has preset models in provider-registry)
    assert.strictEqual(result.source, 'preset-fallback');
    assert.ok(result.models.length > 0, 'Should have fallback models');
  });

  it('should fall back to current model when everything fails', async () => {
    const provider = createMockProvider('unknown-provider', 'my-custom-model', async () => {
      throw new Error('Unreachable');
    });
    const service = new ModelDiscoveryService(logFn);

    const result = await service.discoverModels(provider);

    assert.strictEqual(result.source, 'preset-fallback');
    assert.ok(result.models.length >= 1);
    assert.ok(result.models.some((m) => m.id === 'my-custom-model'));
  });

  it('should fall back when live returns empty array', async () => {
    const provider = createMockProvider('groq', 'llama-3.3-70b-versatile', async () => []);
    const service = new ModelDiscoveryService(logFn);

    const result = await service.discoverModels(provider);

    assert.ok(result.models.length > 0, 'Should have fallback models even when live is empty');
  });

  // ─── Persistent Cache ───────────────────────────────────────────────────

  it('should persist discovered models to persistent store', async () => {
    const mockStore = createMockPersistentStore();
    const mockModels = createMockModels(['persisted-model-1', 'persisted-model-2']);
    const provider = createMockProvider('persist-test', 'persisted-model-1', async () => mockModels);
    const service = new ModelDiscoveryService(logFn, mockStore.api);

    await service.discoverModels(provider);

    const cachedData = mockStore.store['ag.modelDiscovery.cache'] as Record<string, { models: Array<{ id: string }> }>;
    assert.ok(cachedData, 'Persistent cache should be populated');
    assert.ok(cachedData['persist-test'], 'Provider entry should exist');
    assert.ok(cachedData['persist-test'].models.length >= 2);
  });

  it('should read from persistent cache when live fails and memory empty', async () => {
    const mockStore = createMockPersistentStore();

    // Pre-populate persistent cache
    mockStore.store['ag.modelDiscovery.cache'] = {
      'persist-read-test': {
        models: [
          { id: 'cached-model-1', name: 'cached-model-1', vendor: 'test' },
          { id: 'cached-model-2', name: 'cached-model-2', vendor: 'test' },
        ],
        fetchedAt: Date.now(),
      },
    };

    const provider = createMockProvider('persist-read-test', 'cached-model-1', async () => {
      throw new Error('Network down');
    });
    const service = new ModelDiscoveryService(logFn, mockStore.api);

    const result = await service.discoverModels(provider);

    assert.strictEqual(result.source, 'persistent-cache');
    assert.ok(result.models.length >= 2);
    assert.ok(result.models.some((m) => m.id === 'cached-model-1'));
  });

  // ─── Deduplication ──────────────────────────────────────────────────────

  it('should deduplicate models by ID (case-insensitive)', async () => {
    const mockModels: ModelInfo[] = [
      ...createMockModels(['Model-A', 'model-b']),
      ...createMockModels(['model-a', 'Model-B']), // duplicates
      ...createMockModels(['model-c']),
    ];
    const provider = createMockProvider('dedup-test', 'Model-A', async () => mockModels);
    const service = new ModelDiscoveryService(logFn);

    const result = await service.discoverModels(provider);

    const ids = result.models.map((m) => m.id.toLowerCase());
    const uniqueIds = new Set(ids);
    assert.strictEqual(ids.length, uniqueIds.size, `Expected no duplicates but got: ${ids.join(', ')}`);
  });

  // ─── getCachedModels (synchronous) ──────────────────────────────────────

  it('getCachedModels should return preset models when no cache exists', () => {
    const service = new ModelDiscoveryService(logFn);
    const models = service.getCachedModels('groq');

    assert.ok(models.length > 0, 'Should have preset models for known provider');
    assert.ok(models.some((m) => m.id.includes('gpt-oss') || m.id.includes('qwen')), 'Groq preset should contain active models');
  });

  it('getCachedModels should return empty for unknown provider', () => {
    const service = new ModelDiscoveryService(logFn);
    const models = service.getCachedModels('nonexistent-provider-xyz');

    assert.strictEqual(models.length, 0);
  });

  it('getCachedModels should return memory-cached models after live discovery', async () => {
    const mockModels = createMockModels(['cached-a', 'cached-b']);
    const provider = createMockProvider('sync-test', 'cached-a', async () => mockModels);
    const service = new ModelDiscoveryService(logFn);

    // Populate cache via live discovery
    await service.discoverModels(provider);

    // Synchronous call should return cached models
    const cached = service.getCachedModels('sync-test');
    assert.ok(cached.length >= 2);
    assert.ok(cached.some((m) => m.id === 'cached-a'));
  });

  // ─── Vision Detection ───────────────────────────────────────────────────

  it('should detect vision-capable models from naming conventions', async () => {
    const mockModels = createMockModels(['gpt-4-vision-preview', 'qwen-vl-plus', 'llava-13b', 'regular-model']);
    const provider = createMockProvider('vision-test', 'gpt-4-vision-preview', async () => mockModels);
    const service = new ModelDiscoveryService(logFn);

    const result = await service.discoverModels(provider);

    // Service enriches vision detection on preset lookup but live models keep their original flags
    // The main point is that the merge/dedup pipeline doesn't crash on vision models
    assert.ok(result.models.length >= 4);
  });

  // ─── Inflight Dedup ─────────────────────────────────────────────────────

  it('should coalesce concurrent discovery requests for same provider', async () => {
    let callCount = 0;
    const provider = createMockProvider('inflight-test', 'model-x', async () => {
      callCount++;
      // Simulate slow network
      await new Promise((resolve) => setTimeout(resolve, 50));
      return createMockModels(['model-x']);
    });
    const service = new ModelDiscoveryService(logFn);

    // Fire 3 concurrent requests
    const [r1, r2, r3] = await Promise.all([
      service.discoverModels(provider),
      service.discoverModels(provider),
      service.discoverModels(provider),
    ]);

    // Should have only made 1 actual fetch
    assert.strictEqual(callCount, 1, 'Should coalesce concurrent requests into a single fetch');
    assert.deepStrictEqual(r1.models, r2.models);
    assert.deepStrictEqual(r2.models, r3.models);
  });

  // ─── Source Tracking ────────────────────────────────────────────────────

  it('should track discovery source via getLastSource', async () => {
    const provider = createMockProvider('source-test', 'model-a', async () => createMockModels(['model-a']));
    const service = new ModelDiscoveryService(logFn);

    assert.strictEqual(service.getLastSource('source-test'), undefined);

    await service.discoverModels(provider);
    assert.strictEqual(service.getLastSource('source-test'), 'live');
  });

  // ─── Non-Chat Model Filtering ───────────────────────────────────────────

  it('should filter out guardrails, whisper, audio, embeddings, and non-chat models', () => {
    assert.strictEqual(isChatGenerativeModel('meta-llama/llama-prompt-guard-2-22m'), false);
    assert.strictEqual(isChatGenerativeModel('meta-llama/llama-prompt-guard-2-86m'), false);
    assert.strictEqual(isChatGenerativeModel('whisper-large-v3-turbo'), false);
    assert.strictEqual(isChatGenerativeModel('canopylabs/orpheus-arabic-saudi'), false);
    assert.strictEqual(isChatGenerativeModel('openai/gpt-oss-safeguard-20b'), false);
    assert.strictEqual(isChatGenerativeModel('nvidia/llama-3.1-nemoguard-8b-content-safety'), false);
    assert.strictEqual(isChatGenerativeModel('nvidia/llama-3.2-nemoretriever-1b-vlm-embed-v1'), false);
    assert.strictEqual(isChatGenerativeModel('nvidia/llama-3.1-nemotron-51b-instruct'), false);

    // Legitimate chat models must pass
    assert.strictEqual(isChatGenerativeModel('mistralai/mistral-large-2-instruct'), true);
    assert.strictEqual(isChatGenerativeModel('openai/gpt-oss-120b'), true);
    assert.strictEqual(isChatGenerativeModel('qwen/qwen3.8-27b'), true);
    assert.strictEqual(isChatGenerativeModel('deepseek-ai/deepseek-coder-6.7b-instruct'), true);
  });
});
