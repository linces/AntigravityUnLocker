/**
 * AG Universal AI — Provider Registry
 *
 * Contains the built-in preset definitions for all supported providers.
 * Each preset defines the default configuration that can be overridden
 * by user settings.
 */

import type { ProviderConfig } from './types';

export interface ProviderPreset extends Omit<ProviderConfig, 'apiKey'> {
  description: string;
  isLocal: boolean;
  requiresApiKey: boolean;
  defaultModel: string;
  availableModels?: readonly string[];
  keyProcurementUrl?: string;
}

/**
 * Built-in provider presets. API keys are NOT stored here —
 * they are managed via VS Code SecretStorage.
 */
export const PROVIDER_PRESETS: readonly ProviderPreset[] = [
  // ─── Local Providers (Free, Offline) ────────────────────────────────────
  {
    id: 'ollama-local',
    name: 'Ollama',
    description: '100% offline local inference. Free, private, no API key needed.',
    baseUrl: 'http://localhost:11434',
    model: 'qwen2.5-coder:14b',
    defaultModel: 'qwen2.5-coder:14b',
    availableModels: ['qwen2.5-coder:14b', 'qwen2.5-coder:7b', 'llama3.3:70b', 'deepseek-r1:14b', 'deepseek-r1:8b', 'codellama:13b', 'mistral:7b'],
    timeoutMs: 120000,
    isLocal: true,
    requiresApiKey: false,
  },
  {
    id: 'lmstudio-local',
    name: 'LM Studio',
    description: 'Local GGUF model server. Free, private, no API key needed.',
    baseUrl: 'http://localhost:1234/v1',
    model: 'local-model',
    defaultModel: 'local-model',
    availableModels: ['local-model'],
    timeoutMs: 120000,
    isLocal: true,
    requiresApiKey: false,
  },

  // ─── Cloud Providers ────────────────────────────────────────────────────
  {
    id: 'openai',
    name: 'OpenAI',
    description: 'GPT-4o, o1, o3-mini — Official OpenAI API.',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o',
    defaultModel: 'gpt-4o',
    availableModels: ['gpt-4o', 'gpt-4o-mini', 'o1', 'o3-mini', 'gpt-4-turbo'],
    timeoutMs: 120000,
    isLocal: false,
    requiresApiKey: true,
    keyProcurementUrl: 'https://platform.openai.com/api-keys',
  },
  {
    id: 'groq',
    name: 'Groq (Ultra-Fast LPU)',
    description: 'Ultra-fast inference on Groq LPU hardware. Free tier available.',
    baseUrl: 'https://api.groq.com/openai/v1',
    model: 'llama-3.3-70b-versatile',
    defaultModel: 'llama-3.3-70b-versatile',
    availableModels: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'deepseek-r1-distill-llama-70b', 'mixtral-8x7b-32768', 'gemma2-9b-it'],
    timeoutMs: 60000,
    isLocal: false,
    requiresApiKey: true,
    keyProcurementUrl: 'https://console.groq.com/keys',
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    description: 'Multi-model routing with free and paid models. Prompt caching & fallback.',
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'qwen/qwen-2.5-coder-32b-instruct',
    defaultModel: 'qwen/qwen-2.5-coder-32b-instruct',
    availableModels: [
      'qwen/qwen-2.5-coder-32b-instruct',
      'deepseek/deepseek-r1',
      'deepseek/deepseek-chat',
      'anthropic/claude-3.5-sonnet',
      'google/gemini-2.0-flash-001',
      'meta-llama/llama-3.3-70b-instruct',
    ],
    timeoutMs: 60000,
    isLocal: false,
    requiresApiKey: true,
    keyProcurementUrl: 'https://openrouter.ai/settings/keys',
  },
  {
    id: 'dashscope-qwen',
    name: 'DashScope / Alibaba (Qwen)',
    description: 'Qwen Max, Qwen Plus, and Qwen 2.5 Coder models.',
    baseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
    model: 'qwen-max',
    defaultModel: 'qwen-max',
    availableModels: ['qwen-max', 'qwen-plus', 'qwen-turbo', 'qwen2.5-coder-32b-instruct', 'qwen2.5-coder-14b-instruct'],
    timeoutMs: 120000,
    isLocal: false,
    requiresApiKey: true,
    keyProcurementUrl: 'https://dashscope.console.aliyun.com/apiKey',
  },
  {
    id: 'moonshot-kimi',
    name: 'Moonshot AI (Kimi)',
    description: 'Moonshot / Kimi with long context window and deep reasoning.',
    baseUrl: 'https://api.moonshot.ai/v1',
    model: 'moonshot-v1-8k',
    defaultModel: 'moonshot-v1-8k',
    availableModels: ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k', 'kimi-k1.5'],
    timeoutMs: 120000,
    isLocal: false,
    requiresApiKey: true,
    keyProcurementUrl: 'https://platform.moonshot.cn/console/api-keys',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    description: 'DeepSeek V3 and R1 reasoning models.',
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    defaultModel: 'deepseek-chat',
    availableModels: ['deepseek-chat', 'deepseek-reasoner'],
    timeoutMs: 120000,
    isLocal: false,
    requiresApiKey: true,
    keyProcurementUrl: 'https://platform.deepseek.com/api_keys',
  },
  {
    id: 'siliconflow',
    name: 'SiliconFlow',
    description: 'Fast Qwen and DeepSeek model hosting. Free sign-up credits.',
    baseUrl: 'https://api.siliconflow.cn/v1',
    model: 'Qwen/Qwen2.5-Coder-32B-Instruct',
    defaultModel: 'Qwen/Qwen2.5-Coder-32B-Instruct',
    availableModels: ['Qwen/Qwen2.5-Coder-32B-Instruct', 'deepseek-ai/DeepSeek-R1', 'deepseek-ai/DeepSeek-V3', 'Qwen/Qwen2.5-72B-Instruct'],
    timeoutMs: 60000,
    isLocal: false,
    requiresApiKey: true,
    keyProcurementUrl: 'https://cloud.siliconflow.cn/account/ak',
  },
  {
    id: 'together-ai',
    name: 'Together AI',
    description: 'Open-source model hosting and fine-tuning.',
    baseUrl: 'https://api.together.xyz/v1',
    model: 'Qwen/Qwen2.5-Coder-32B-Instruct',
    defaultModel: 'Qwen/Qwen2.5-Coder-32B-Instruct',
    availableModels: ['Qwen/Qwen2.5-Coder-32B-Instruct', 'deepseek-ai/DeepSeek-R1', 'meta-llama/Llama-3.3-70B-Instruct-Turbo'],
    timeoutMs: 60000,
    isLocal: false,
    requiresApiKey: true,
    keyProcurementUrl: 'https://api.together.xyz/settings/api-keys',
  },
  {
    id: 'fireworks-ai',
    name: 'Fireworks AI',
    description: 'High-speed function calling and vision support.',
    baseUrl: 'https://api.fireworks.ai/inference/v1',
    model: 'accounts/fireworks/models/qwen2p5-coder-32b-instruct',
    defaultModel: 'accounts/fireworks/models/qwen2p5-coder-32b-instruct',
    availableModels: ['accounts/fireworks/models/qwen2p5-coder-32b-instruct', 'accounts/fireworks/models/deepseek-r1', 'accounts/fireworks/models/llama-v3p3-70b-instruct'],
    timeoutMs: 60000,
    isLocal: false,
    requiresApiKey: true,
    keyProcurementUrl: 'https://fireworks.ai/account/api-keys',
  },
  {
    id: 'nvidia',
    name: 'NVIDIA NIM',
    description: 'NVIDIA NIM microservices: Llama 3.3 70B, Nemotron 70B, DeepSeek R1 & Qwen 2.5 Coder.',
    baseUrl: 'https://integrate.api.nvidia.com/v1',
    model: 'meta/llama-3.3-70b-instruct',
    defaultModel: 'meta/llama-3.3-70b-instruct',
    availableModels: [
      'meta/llama-3.3-70b-instruct',
      'nvidia/llama-3.1-nemotron-70b-instruct',
      'deepseek-ai/deepseek-r1',
      'qwen/qwen2.5-coder-32b-instruct',
      'mistralai/mistral-large-2-instruct',
    ],
    timeoutMs: 120000,
    isLocal: false,
    requiresApiKey: true,
    keyProcurementUrl: 'https://build.nvidia.com',
  },
  {
    id: 'zai-glm',
    name: 'Z.ai (GLM)',
    description: 'Z.ai / Zhipu AI GLM-5.2 flagship open-source model with 1M context window.',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    model: 'glm-5.2',
    defaultModel: 'glm-5.2',
    availableModels: ['glm-5.2', 'glm-4-plus', 'glm-4-flash', 'cogview-3-plus'],
    timeoutMs: 120000,
    isLocal: false,
    requiresApiKey: true,
    keyProcurementUrl: 'https://z.ai/manage-apikey/apikey-list',
  },
] as const;


/**
 * Get a provider preset by ID.
 */
export function getPreset(id: string): ProviderPreset | undefined {
  return PROVIDER_PRESETS.find((p) => p.id === id);
}

/**
 * Get all provider presets.
 */
export function getAllPresets(): readonly ProviderPreset[] {
  return PROVIDER_PRESETS;
}

/**
 * Get only local provider presets.
 */
export function getLocalPresets(): ProviderPreset[] {
  return PROVIDER_PRESETS.filter((p) => p.isLocal);
}

/**
 * Get only cloud provider presets.
 */
export function getCloudPresets(): ProviderPreset[] {
  return PROVIDER_PRESETS.filter((p) => !p.isLocal);
}
