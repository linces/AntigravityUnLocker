/**
 * AG Universal AI — Model Auto-Discovery Service
 *
 * Live-queries provider /models endpoints, caches results in-memory (TTL)
 * and persistently in VS Code globalState, with a graceful fallback chain:
 *   ① Live API fetch (/models or /api/tags)
 *   ② In-memory cache (30 min TTL)
 *   ③ Persistent cache (globalState, survives restarts)
 *   ④ Static preset availableModels[]
 *   ⑤ Current provider.config.model as single-item fallback
 */

import type { ModelInfo, ILLMProvider } from './types';
import { getPreset } from './provider-registry';

// ─── Types ──────────────────────────────────────────────────────────────────

export type DiscoverySource = 'live' | 'memory-cache' | 'persistent-cache' | 'preset-fallback';

export interface DiscoveryResult {
  providerId: string;
  models: ModelInfo[];
  source: DiscoverySource;
  fetchedAt: number;
  error?: string;
}

interface CacheEntry {
  models: ModelInfo[];
  fetchedAt: number;
  source: DiscoverySource;
}

/** Serializable format for globalState persistence. */
interface PersistedCacheEntry {
  models: Array<{ id: string; name: string; vendor: string }>;
  fetchedAt: number;
}

interface PersistentStore {
  get<T>(key: string, defaultValue: T): T;
  update(key: string, value: unknown): Thenable<void>;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const MEMORY_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
const DISCOVERY_TIMEOUT_MS = 8000;           // 8 second timeout per endpoint
const PERSISTENT_CACHE_KEY = 'ag.modelDiscovery.cache';

/**
 * Rigorous filter to ensure only chat/generative capable models are exposed to the user.
 * Filters out guardrails, safety classifiers, embeddings, rerankers, speech/audio/TTS,
 * reward models, parsers, and known decommissioned cloud function IDs.
 */
export function isChatGenerativeModel(modelId: string): boolean {
  const lower = modelId.toLowerCase();
  const nonChatPatterns = [
    'guard', 'safety', 'moderation', 'safeguard',
    'embed', 'retriever', 'nv-embed',
    'whisper', 'tts', 'audio', 'orpheus', 'voice', 'speech',
    'dall-e', 'flux', 'cogview', 'diffusion',
    'reward', 'parse', 'detector', 'clip',
    'calibration', 'synthetic', 'video-detector',
    '51b-instruct', '51b'
  ];
  return !nonChatPatterns.some((p) => lower.includes(p));
}

// ─── Service ────────────────────────────────────────────────────────────────

export class ModelDiscoveryService {
  private memoryCache = new Map<string, CacheEntry>();
  private inflightRequests = new Map<string, Promise<DiscoveryResult>>();
  private logFn: (msg: string) => void;
  private persistentStore: PersistentStore | undefined;

  constructor(
    logFn: (msg: string) => void,
    persistentStore?: PersistentStore
  ) {
    this.logFn = logFn;
    this.persistentStore = persistentStore;
  }

  // ─── Public API ─────────────────────────────────────────────────────────

  /**
   * Discover available models for a provider.
   * Uses the fallback chain: live → memory cache → persistent cache → preset → config model.
   *
   * @param provider  - The LLM provider adapter instance.
   * @param forceRefresh - If true, skip caches and query live.
   */
  public async discoverModels(
    provider: ILLMProvider,
    forceRefresh = false
  ): Promise<DiscoveryResult> {
    const providerId = provider.id;

    // 1. Check in-flight dedup (don't fire duplicate requests)
    if (!forceRefresh) {
      const inflight = this.inflightRequests.get(providerId);
      if (inflight) {
        return inflight;
      }
    }

    // 2. Check memory cache (if not forcing refresh)
    if (!forceRefresh) {
      const cached = this.getFromMemoryCache(providerId);
      if (cached) {
        return {
          providerId,
          models: cached.models,
          source: 'memory-cache',
          fetchedAt: cached.fetchedAt,
        };
      }
    }

    // 3. Live fetch with dedup tracking
    const fetchPromise = this.fetchLive(provider)
      .finally(() => {
        this.inflightRequests.delete(providerId);
      });

    this.inflightRequests.set(providerId, fetchPromise);
    return fetchPromise;
  }

  /**
   * Get models synchronously from cache only (no network).
   * Useful for instant UI rendering before async discovery completes.
   */
  public getCachedModels(providerId: string): ModelInfo[] {
    // Memory cache first
    const memory = this.memoryCache.get(providerId);
    if (memory && !this.isExpired(memory.fetchedAt)) {
      return memory.models;
    }

    // Persistent cache
    const persistent = this.getFromPersistentCache(providerId);
    if (persistent && persistent.length > 0) {
      return persistent;
    }

    // Static preset fallback
    return this.getPresetModels(providerId);
  }

  /**
   * Invalidate cache for a specific provider or all providers.
   */
  public invalidateCache(providerId?: string): void {
    if (providerId) {
      this.memoryCache.delete(providerId);
      this.log(`Cache invalidated for provider: ${providerId}`);
    } else {
      this.memoryCache.clear();
      this.log('All model caches invalidated');
    }
  }

  /**
   * Get the source of the last discovery result for a provider.
   */
  public getLastSource(providerId: string): DiscoverySource | undefined {
    return this.memoryCache.get(providerId)?.source;
  }

  // ─── Private: Live Fetch ────────────────────────────────────────────────

  private async fetchLive(provider: ILLMProvider): Promise<DiscoveryResult> {
    const providerId = provider.id;

    try {
      let liveModels: ModelInfo[] = [];

      // Use provider's own listModels if available
      if (provider.listModels) {
        liveModels = await Promise.race([
          provider.listModels(),
          new Promise<ModelInfo[]>((_, reject) =>
            setTimeout(() => reject(new Error('Discovery timeout')), DISCOVERY_TIMEOUT_MS)
          ),
        ]);
      }

      if (liveModels.length > 0) {
        // Filter out non-chat, safety-guards, embeddings, voice, audio and junk functions
        const chatCapable = liveModels.filter((m) => isChatGenerativeModel(m.id));
        const finalModels = chatCapable.length > 0 ? chatCapable : liveModels;

        // Enrich, deduplicate, and sort
        const merged = this.mergeWithPreset(providerId, finalModels);
        const deduped = this.deduplicateModels(merged);
        const sorted = this.sortModels(deduped, provider.config.model);

        // Cache in memory
        this.setMemoryCache(providerId, sorted, 'live');

        // Persist for offline use
        this.persistCache(providerId, sorted);

        this.log(`[${providerId}] Live discovery: ${sorted.length} models found (filtered from ${liveModels.length})`);
        return {
          providerId,
          models: sorted,
          source: 'live',
          fetchedAt: Date.now(),
        };
      }

      // Live returned empty — fall through to caches
      this.log(`[${providerId}] Live discovery returned empty, checking caches...`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.log(`[${providerId}] Live discovery failed: ${msg}`);

      // Check memory cache (even if expired — better than nothing)
      const staleMemory = this.memoryCache.get(providerId);
      if (staleMemory && staleMemory.models.length > 0) {
        this.log(`[${providerId}] Using stale memory cache (${staleMemory.models.length} models)`);
        return {
          providerId,
          models: staleMemory.models,
          source: 'memory-cache',
          fetchedAt: staleMemory.fetchedAt,
          error: msg,
        };
      }
    }

    // Persistent cache fallback
    const persistent = this.getFromPersistentCache(providerId);
    if (persistent.length > 0) {
      this.log(`[${providerId}] Using persistent cache: ${persistent.length} models`);
      this.setMemoryCache(providerId, persistent, 'persistent-cache');
      return {
        providerId,
        models: persistent,
        source: 'persistent-cache',
        fetchedAt: Date.now(),
      };
    }

    // Static preset fallback
    const presetModels = this.getPresetModels(providerId);
    if (presetModels.length > 0) {
      this.log(`[${providerId}] Using preset fallback: ${presetModels.length} models`);
      this.setMemoryCache(providerId, presetModels, 'preset-fallback');
      return {
        providerId,
        models: presetModels,
        source: 'preset-fallback',
        fetchedAt: Date.now(),
      };
    }

    // Absolute last resort: the currently configured model
    const currentModel = provider.config.model;
    const singleModel: ModelInfo[] = currentModel
      ? [{
          id: currentModel,
          name: currentModel,
          vendor: providerId,
          maxInputTokens: 128000,
          maxOutputTokens: 4096,
          supportsTools: true,
          supportsVision: false,
        }]
      : [];

    this.log(`[${providerId}] Using current model fallback: ${currentModel || '(none)'}`);
    return {
      providerId,
      models: singleModel,
      source: 'preset-fallback',
      fetchedAt: Date.now(),
      error: 'All discovery methods exhausted',
    };
  }

  // ─── Private: Cache Management ──────────────────────────────────────────

  private getFromMemoryCache(providerId: string): CacheEntry | undefined {
    const entry = this.memoryCache.get(providerId);
    if (!entry) { return undefined; }
    if (this.isExpired(entry.fetchedAt)) {
      return undefined; // Expired, but we don't delete — stale data is still useful as fallback
    }
    return entry;
  }

  private setMemoryCache(providerId: string, models: ModelInfo[], source: DiscoverySource): void {
    this.memoryCache.set(providerId, {
      models,
      fetchedAt: Date.now(),
      source,
    });
  }

  private isExpired(fetchedAt: number): boolean {
    return Date.now() - fetchedAt > MEMORY_CACHE_TTL_MS;
  }

  private getFromPersistentCache(providerId: string): ModelInfo[] {
    if (!this.persistentStore) { return []; }

    try {
      const allCaches = this.persistentStore.get<Record<string, PersistedCacheEntry>>(
        PERSISTENT_CACHE_KEY,
        {}
      );

      const entry = allCaches[providerId];
      if (!entry || !entry.models || entry.models.length === 0) {
        return [];
      }

      // Convert persisted slim format back to full ModelInfo
      return entry.models.map((m) => ({
        id: m.id,
        name: m.name || m.id,
        vendor: m.vendor || providerId,
        maxInputTokens: 128000,
        maxOutputTokens: 4096,
        supportsTools: true,
        supportsVision: this.looksLikeVisionModel(m.id),
      }));
    } catch {
      return [];
    }
  }

  private persistCache(providerId: string, models: ModelInfo[]): void {
    if (!this.persistentStore) { return; }

    try {
      const allCaches = this.persistentStore.get<Record<string, PersistedCacheEntry>>(
        PERSISTENT_CACHE_KEY,
        {}
      );

      allCaches[providerId] = {
        models: models.map((m) => ({
          id: m.id,
          name: m.name,
          vendor: m.vendor,
        })),
        fetchedAt: Date.now(),
      };

      // Fire-and-forget persistence
      this.persistentStore.update(PERSISTENT_CACHE_KEY, allCaches);
    } catch {
      // Persistence is best-effort
    }
  }

  // ─── Private: Preset/Static Fallback ────────────────────────────────────

  private getPresetModels(providerId: string): ModelInfo[] {
    const preset = getPreset(providerId);
    if (!preset?.availableModels || preset.availableModels.length === 0) {
      return [];
    }

    return Array.from(preset.availableModels)
      .filter((m) => isChatGenerativeModel(m))
      .map((m) => ({
        id: m,
        name: m,
        vendor: providerId,
        maxInputTokens: 128000,
        maxOutputTokens: 4096,
        supportsTools: true,
        supportsVision: this.looksLikeVisionModel(m),
      }));
  }

  // ─── Private: Model Processing ──────────────────────────────────────────

  /**
   * Merge live-discovered models with static preset models.
   * Live models take precedence; verified preset models are appended to guarantee stable fallbacks.
   */
  private mergeWithPreset(providerId: string, liveModels: ModelInfo[]): ModelInfo[] {
    const preset = getPreset(providerId);
    if (!preset?.availableModels || preset.availableModels.length === 0) {
      return liveModels;
    }

    const liveIds = new Set(liveModels.map((m) => m.id.toLowerCase()));
    const merged = [...liveModels];

    for (const presetModel of preset.availableModels) {
      if (!liveIds.has(presetModel.toLowerCase()) && isChatGenerativeModel(presetModel)) {
        merged.push({
          id: presetModel,
          name: presetModel,
          vendor: providerId,
          maxInputTokens: 128000,
          maxOutputTokens: 4096,
          supportsTools: true,
          supportsVision: this.looksLikeVisionModel(presetModel),
        });
      }
    }

    return merged;
  }

  /**
   * Deduplicate models by ID (case-insensitive).
   */
  private deduplicateModels(models: ModelInfo[]): ModelInfo[] {
    const seen = new Map<string, ModelInfo>();
    for (const model of models) {
      const key = model.id.toLowerCase();
      if (!seen.has(key)) {
        seen.set(key, model);
      }
    }
    return Array.from(seen.values());
  }

  /**
   * Sort models: currently active model first, then alphabetically.
   */
  private sortModels(models: ModelInfo[], currentModel?: string): ModelInfo[] {
    return models.sort((a, b) => {
      // Current model always first
      if (currentModel) {
        if (a.id === currentModel) { return -1; }
        if (b.id === currentModel) { return 1; }
      }
      return a.id.localeCompare(b.id);
    });
  }

  private looksLikeVisionModel(modelId: string): boolean {
    const lower = modelId.toLowerCase();
    return lower.includes('vision') || lower.includes('vl') || lower.includes('llava');
  }

  private log(msg: string): void {
    this.logFn(`[ModelDiscovery] ${msg}`);
  }
}
