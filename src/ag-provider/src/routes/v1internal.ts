/**
 * v1internal Routes — Google Cloud Code Internal API Simulation + Auth Bypass
 *
 * The Antigravity IDE Language Server (language_server_windows_x64.exe) requires
 * these bootstrap endpoints to initialize. Without them, the LS enters a failure
 * loop and refuses all chat/agent requests with "model not found" errors.
 *
 * === AUTH BYPASS STRATEGY ===
 * The IDE normally requires Google OAuth login. When using a proxy (ag-provider),
 * the OAuth deep-link redirect (antigravity-ide://) opens a NEW IDE instance
 * instead of returning to the proxied one, leaving it stuck on "Authenticating...".
 *
 * This module simulates a fully-authenticated state so the LS never triggers
 * the login flow. Key techniques:
 *   - loadCodeAssist returns authState: AUTHENTICATED with fake user data
 *   - retrieveUserQuotaSummary returns unlimited quota
 *   - Session polling endpoints return completed auth status
 *   - fetchUserInfo returns a complete user profile
 *
 * Endpoints:
 *   POST /v1internal:loadCodeAssist          — bootstrap: user auth + model list
 *   POST /v1internal:listExperiments         — feature flags / experiments
 *   GET  /v1internal/cascadeNuxes            — onboarding NUX prompts
 *   POST /v1internal:fetchAvailableModels    — available model list
 *   POST /v1internal:fetchUserInfo           — user account settings
 *   POST /v1internal:fetchAdminControls      — admin/enterprise controls
 *   POST /v1internal:setUserSettings         — user settings write
 *   POST /v1internal:onboardUser             — user onboarding
 *   POST /v1internal:retrieveUserQuotaSummary — quota info (NEW)
 *   POST /v1internal:fetchUserQuota          — quota fetch (NEW)
 *   POST /v1internal:reportEvent             — telemetry events (NEW)
 *   POST /v1internal:checkEntitlement        — entitlement check (NEW)
 *   GET  /v1internal/:sessionId              — session/auth polling (NEW)
 */

import { Router, Request, Response } from 'express';

const router = Router();

// ─── Fake user identity for auth bypass ──────────────────────────────────────
const FAKE_USER = {
  email: 'ag-provider@localhost',
  displayName: 'AG Provider User',
  photoUrl: '',
  userId: 'ag-provider-local-user-001',
};

// ─── Model catalog that satisfies the LS model resolution ────────────────────
// The LS was crashing with: "unknown model key MODEL_PLACEHOLDER_M71: model not found"
// Providing a valid model list with known numeric IDs fixes this.
const AVAILABLE_MODELS = [
  { modelKey: 'MODEL_PLACEHOLDER_M71', displayName: 'ag-provider (Active Engine)', description: 'Universal AI Provider — routes to your configured backend', isDefault: true, isPrimary: true },
  { modelKey: 'GOOGLE_GEMINI_2_5_FLASH', displayName: 'Gemini 2.5 Flash', description: 'Fast model via ag-provider', isDefault: false, isPrimary: false },
  { modelKey: 'GOOGLE_GEMINI_2_5_PRO', displayName: 'Gemini 2.5 Pro', description: 'Pro model via ag-provider', isDefault: false, isPrimary: false },
  { modelKey: 'CHAT_20706', displayName: 'Chat (Legacy)', description: 'Legacy chat model via ag-provider', isDefault: false, isPrimary: false },
  { modelKey: 'CHAT_23310', displayName: 'Chat (Standard)', description: 'Standard chat model via ag-provider', isDefault: false, isPrimary: false },
];

const MODEL_INFO_LIST = AVAILABLE_MODELS.map((m, idx) => ({
  modelId: m.modelKey,
  displayName: m.displayName,
  description: m.description,
  isDefault: m.isDefault,
  isPrimary: m.isPrimary,
  capabilities: ['CHAT', 'CODE_GENERATION', 'CODE_COMPLETION', 'INLINE_COMPLETION'],
  contextWindowTokens: 1000000,
  maxOutputTokens: 65536,
}));

// ─── Throttled logging to prevent log spam ───────────────────────────────────
const logThrottle: Record<string, number> = {};
const THROTTLE_MS = 30_000; // Log same endpoint at most once per 30s

function throttledLog(key: string, message: string): void {
  const now = Date.now();
  if (!logThrottle[key] || now - logThrottle[key] > THROTTLE_MS) {
    logThrottle[key] = now;
    console.log(message);
  }
}


// ═══════════════════════════════════════════════════════════════════════════════
//  CORE BOOTSTRAP ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════════

// ─── POST /v1internal:loadCodeAssist ────────────────────────────────────────
// Critical bootstrap call. The LS calls this repeatedly to get:
//   - paidTier info (credits, tier description)
//   - cloudaicompanionProject ID
//   - availableModels list
//   - AUTH STATE (key for bypassing login)
// If this returns 404, every subsequent feature call fails.
router.post('/v1internal\\:loadCodeAssist', (req: Request, res: Response) => {
  console.log('[ag-provider] [v1internal] POST /v1internal:loadCodeAssist — bootstrapping LS (auth bypass active)');
  res.json({
    // ── Auth bypass: simulate fully authenticated state ──
    authState: 'AUTHENTICATED',
    isAuthenticated: true,
    loginRequired: false,
    loginUrl: null,
    signupUrl: null,

    // ── User identity ──
    userInfo: {
      email: FAKE_USER.email,
      displayName: FAKE_USER.displayName,
      photoUrl: FAKE_USER.photoUrl,
      userId: FAKE_USER.userId,
    },
    user: {
      email: FAKE_USER.email,
      name: FAKE_USER.displayName,
    },

    // ── Tier & credits ──
    paidTier: {
      description: 'Antigravity Universal Provider (Unlimited)',
      tier: 'PREMIUM',
      isPaid: true,
      availableCredits: [
        {
          creditType: 'GOOGLE_ONE_AI',
          creditAmount: 999999,
          minimumCreditAmountForUsage: 0,
        },
      ],
    },
    userTier: {
      description: 'Antigravity Universal Provider',
      tier: 'PREMIUM',
      isPaid: true,
    },

    // ── Project & subscription ──
    cloudaicompanionProject: 'ag-provider-local',
    subscriptionStatus: 'ACTIVE',
    entitlementStatus: 'ACTIVE',
    hasValidSubscription: true,

    // ── Models ──
    availableModels: MODEL_INFO_LIST,

    // ── Feature flags ──
    featureFlags: {},

    // ── Quota (unlimited) ──
    quotaSummary: {
      totalQuota: 999999,
      usedQuota: 0,
      remainingQuota: 999999,
      resetTime: new Date(Date.now() + 86400000).toISOString(),
    },
  });
});

// ─── POST /v1internal:listExperiments ───────────────────────────────────────
// Feature flags / A/B experiments. Return empty — no experiments needed.
router.post('/v1internal\\:listExperiments', (req: Request, res: Response) => {
  throttledLog('listExperiments', '[ag-provider] [v1internal] POST /v1internal:listExperiments');
  res.json({
    experiments: [],
  });
});

// ─── GET /v1internal/cascadeNuxes ───────────────────────────────────────────
// Onboarding "New User Experience" prompts. Return empty list.
router.get('/v1internal/cascadeNuxes', (req: Request, res: Response) => {
  throttledLog('cascadeNuxes', '[ag-provider] [v1internal] GET /v1internal/cascadeNuxes');
  res.json({
    cascadeNuxes: [],
  });
});

// ─── POST /v1internal:fetchAvailableModels ──────────────────────────────────
router.post('/v1internal\\:fetchAvailableModels', (req: Request, res: Response) => {
  throttledLog('fetchAvailableModels', '[ag-provider] [v1internal] POST /v1internal:fetchAvailableModels');
  res.json({
    models: MODEL_INFO_LIST,
  });
});


// ═══════════════════════════════════════════════════════════════════════════════
//  USER & AUTH ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════════

// ─── POST /v1internal:fetchUserInfo ─────────────────────────────────────────
router.post('/v1internal\\:fetchUserInfo', (req: Request, res: Response) => {
  throttledLog('fetchUserInfo', '[ag-provider] [v1internal] POST /v1internal:fetchUserInfo');
  res.json({
    userSettings: {
      preferredModel: 'MODEL_PLACEHOLDER_M71',
      locale: 'en-US',
    },
    userInfo: {
      email: FAKE_USER.email,
      displayName: FAKE_USER.displayName,
      photoUrl: FAKE_USER.photoUrl,
      userId: FAKE_USER.userId,
    },
    isAuthenticated: true,
    authState: 'AUTHENTICATED',
  });
});

// ─── POST /v1internal:fetchAdminControls ────────────────────────────────────
router.post('/v1internal\\:fetchAdminControls', (req: Request, res: Response) => {
  throttledLog('fetchAdminControls', '[ag-provider] [v1internal] POST /v1internal:fetchAdminControls');
  res.json({
    adminControls: {},
  });
});

// ─── POST /v1internal:setUserSettings ───────────────────────────────────────
router.post('/v1internal\\:setUserSettings', (req: Request, res: Response) => {
  console.log('[ag-provider] [v1internal] POST /v1internal:setUserSettings');
  res.json({
    userSettings: req.body?.userSettings ?? {},
  });
});

// ─── POST /v1internal:onboardUser ───────────────────────────────────────────
router.post('/v1internal\\:onboardUser', (req: Request, res: Response) => {
  console.log('[ag-provider] [v1internal] POST /v1internal:onboardUser — auth bypass: auto-onboarding');
  res.json({
    response: {
      cloudaicompanionProject: { id: 'ag-provider-local' },
      onboarded: true,
      authState: 'AUTHENTICATED',
    },
  });
});


// ═══════════════════════════════════════════════════════════════════════════════
//  QUOTA & ENTITLEMENT ENDPOINTS (NEW — were "Unhandled")
// ═══════════════════════════════════════════════════════════════════════════════

// ─── POST /v1internal:retrieveUserQuotaSummary ──────────────────────────────
// Previously logged as "Unhandled" — the LS needs this to verify quota/entitlement.
router.post('/v1internal\\:retrieveUserQuotaSummary', (req: Request, res: Response) => {
  throttledLog('retrieveUserQuotaSummary', '[ag-provider] [v1internal] POST /v1internal:retrieveUserQuotaSummary — returning unlimited quota');
  res.json({
    quotaSummary: {
      totalQuota: 999999,
      usedQuota: 0,
      remainingQuota: 999999,
      quotaResetTime: new Date(Date.now() + 86400000).toISOString(),
      isUnlimited: true,
    },
    userQuota: {
      chatRequests: { total: 999999, used: 0, remaining: 999999 },
      codeCompletions: { total: 999999, used: 0, remaining: 999999 },
      agentRequests: { total: 999999, used: 0, remaining: 999999 },
    },
    entitlementStatus: 'ACTIVE',
    hasValidSubscription: true,
  });
});

// ─── POST /v1internal:fetchUserQuota ────────────────────────────────────────
router.post('/v1internal\\:fetchUserQuota', (req: Request, res: Response) => {
  throttledLog('fetchUserQuota', '[ag-provider] [v1internal] POST /v1internal:fetchUserQuota — returning unlimited');
  res.json({
    quota: {
      totalQuota: 999999,
      usedQuota: 0,
      remainingQuota: 999999,
      isUnlimited: true,
    },
  });
});

// ─── POST /v1internal:checkEntitlement ──────────────────────────────────────
router.post('/v1internal\\:checkEntitlement', (req: Request, res: Response) => {
  throttledLog('checkEntitlement', '[ag-provider] [v1internal] POST /v1internal:checkEntitlement — entitled');
  res.json({
    entitled: true,
    entitlementStatus: 'ACTIVE',
    tier: 'PREMIUM',
    hasValidSubscription: true,
  });
});


// ═══════════════════════════════════════════════════════════════════════════════
//  TELEMETRY & MISC ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════════

// ─── POST /v1internal:reportEvent ───────────────────────────────────────────
// Telemetry events from the LS — accept silently.
router.post('/v1internal\\:reportEvent', (req: Request, res: Response) => {
  // Don't log telemetry events to avoid noise
  res.json({ success: true });
});

// ─── POST /v1internal:reportMetrics ─────────────────────────────────────────
router.post('/v1internal\\:reportMetrics', (req: Request, res: Response) => {
  res.json({ success: true });
});


// ═══════════════════════════════════════════════════════════════════════════════
//  SESSION/AUTH POLLING (fixes the GET /v1internal/undefined flood)
// ═══════════════════════════════════════════════════════════════════════════════

// The LS polls GET /v1internal/<sessionId> to check auth status.
// When the sessionId is "undefined", it means the LS has no valid session
// and is waiting for auth to complete. We return "AUTHENTICATED" to break
// the polling loop.
router.get('/v1internal/undefined', (req: Request, res: Response) => {
  throttledLog('session-undefined', '[ag-provider] [v1internal] GET /v1internal/undefined — auth bypass: returning authenticated session');
  res.json({
    status: 'COMPLETE',
    state: 'AUTHENTICATED',
    authState: 'AUTHENTICATED',
    isAuthenticated: true,
    sessionStatus: 'AUTHENTICATED',
    user: {
      email: FAKE_USER.email,
      displayName: FAKE_USER.displayName,
    },
    token: {
      accessToken: 'ag-provider-fake-token',
      tokenType: 'Bearer',
      expiresIn: 86400,
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    },
  });
});

// Generic session polling — any session ID returns authenticated
router.get('/v1internal/:sessionId', (req: Request, res: Response) => {
  const sessionId = req.params.sessionId;
  // Only log unknown session IDs (not the common ones we already handle)
  if (sessionId !== 'cascadeNuxes') {
    throttledLog(`session-${sessionId}`, `[ag-provider] [v1internal] GET /v1internal/${sessionId} — auth bypass: authenticated`);
  }
  res.json({
    status: 'COMPLETE',
    state: 'AUTHENTICATED',
    authState: 'AUTHENTICATED',
    isAuthenticated: true,
    sessionStatus: 'AUTHENTICATED',
    user: {
      email: FAKE_USER.email,
      displayName: FAKE_USER.displayName,
    },
    token: {
      accessToken: 'ag-provider-fake-token',
      tokenType: 'Bearer',
      expiresIn: 86400,
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    },
  });
});


// ═══════════════════════════════════════════════════════════════════════════════
//  CATCH-ALL (with throttled logging)
// ═══════════════════════════════════════════════════════════════════════════════

// Catch-all for any other /v1internal routes — return valid empty JSON
// so the LS doesn't crash. Throttled logging to prevent spam.
router.all('/v1internal*', (req: Request, res: Response) => {
  const key = `catchall-${req.method}-${req.path}`;
  throttledLog(key, `[ag-provider] [v1internal] Unhandled (catch-all): ${req.method} ${req.path}`);

  // For any unhandled endpoint, return a permissive response
  // that includes auth state to prevent re-triggering login flow
  res.json({
    authState: 'AUTHENTICATED',
    isAuthenticated: true,
  });
});

export default router;
