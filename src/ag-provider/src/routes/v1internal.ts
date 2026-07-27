/**
 * v1internal Routes — Google Cloud Code Internal API Simulation
 *
 * The Antigravity IDE Language Server (language_server_windows_x64.exe) requires
 * these bootstrap endpoints to initialize. Without them, the LS enters a failure
 * loop and refuses all chat/agent requests with "model not found" errors.
 *
 * Endpoints discovered by decompiling out/main.js and reading ls-main.log traces:
 *   POST /v1internal:loadCodeAssist        — bootstrap: user auth + model list
 *   POST /v1internal:listExperiments       — feature flags / experiments
 *   GET  /v1internal/cascadeNuxes          — onboarding NUX prompts
 *   POST /v1internal:fetchAvailableModels  — available model list
 *   POST /v1internal:fetchUserInfo         — user account settings
 *   POST /v1internal:fetchAdminControls    — admin/enterprise controls
 *   POST /v1internal:setUserSettings       — user settings write
 */

import { Router, Request, Response } from 'express';

const router = Router();

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

// ─── POST /v1internal:loadCodeAssist ────────────────────────────────────────
// Critical bootstrap call. The LS calls this repeatedly to get:
//   - paidTier info (credits, tier description)
//   - cloudaicompanionProject ID
//   - availableModels list
// If this returns 404, every subsequent feature call fails.
router.post('/v1internal\\:loadCodeAssist', (req: Request, res: Response) => {
  console.log('[ag-provider] [v1internal] POST /v1internal:loadCodeAssist — bootstrapping LS');
  res.json({
    paidTier: {
      description: 'Antigravity Universal Provider (Unlimited)',
      availableCredits: [
        {
          creditType: 'GOOGLE_ONE_AI',
          creditAmount: 999999,
          minimumCreditAmountForUsage: 0,
        },
      ],
    },
    cloudaicompanionProject: 'ag-provider-local',
    availableModels: MODEL_INFO_LIST,
    userTier: {
      description: 'Antigravity Universal Provider',
    },
    featureFlags: {},
    subscriptionStatus: 'ACTIVE',
  });
});

// ─── POST /v1internal:listExperiments ───────────────────────────────────────
// Feature flags / A/B experiments. Return empty — no experiments needed.
router.post('/v1internal\\:listExperiments', (req: Request, res: Response) => {
  console.log('[ag-provider] [v1internal] POST /v1internal:listExperiments');
  res.json({
    experiments: [],
  });
});

// ─── GET /v1internal/cascadeNuxes ───────────────────────────────────────────
// Onboarding "New User Experience" prompts. Return empty list.
router.get('/v1internal/cascadeNuxes', (req: Request, res: Response) => {
  // Only log once per session to avoid spam
  console.log('[ag-provider] [v1internal] GET /v1internal/cascadeNuxes');
  res.json({
    cascadeNuxes: [],
  });
});

// ─── POST /v1internal:fetchAvailableModels ──────────────────────────────────
router.post('/v1internal\\:fetchAvailableModels', (req: Request, res: Response) => {
  console.log('[ag-provider] [v1internal] POST /v1internal:fetchAvailableModels');
  res.json({
    models: MODEL_INFO_LIST,
  });
});

// ─── POST /v1internal:fetchUserInfo ─────────────────────────────────────────
router.post('/v1internal\\:fetchUserInfo', (req: Request, res: Response) => {
  console.log('[ag-provider] [v1internal] POST /v1internal:fetchUserInfo');
  res.json({
    userSettings: {
      preferredModel: 'MODEL_PLACEHOLDER_M71',
      locale: 'en-US',
    },
  });
});

// ─── POST /v1internal:fetchAdminControls ────────────────────────────────────
router.post('/v1internal\\:fetchAdminControls', (req: Request, res: Response) => {
  console.log('[ag-provider] [v1internal] POST /v1internal:fetchAdminControls');
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
  console.log('[ag-provider] [v1internal] POST /v1internal:onboardUser');
  res.json({
    response: {
      cloudaicompanionProject: { id: 'ag-provider-local' },
    },
  });
});

// ─── Catch-all for any other /v1internal routes ──────────────────────────────
router.all('/v1internal*', (req: Request, res: Response) => {
  console.log(`[ag-provider] [v1internal] Unhandled: ${req.method} ${req.path}`);
  res.json({});
});

export default router;
