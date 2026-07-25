---
domain: dev
category: provider_specification
type: documentation
created: 2026-07-25
last_updated: 2026-07-25T01:05:00-03:00
version: 1.2.0
project_registry: projects_registry.yaml
---

# Target Providers & Adapter Specification - Antigravity Universal AI Provider

## Overview

This document specifies the target AI provider ecosystem, capability requirements, configuration structure, and the standard `ILLMProvider` interface powering the `ag-provider` compatibility layer.

---

## Supported Providers

| Provider | Access Model | Base URL / Protocol | Key Features |
| :--- | :--- | :--- | :--- |
| **Kimi K3 (Moonshot AI)** | Cloud API | `https://api.moonshot.ai/v1` | **1,048,576 Context Tokens**, Always-on reasoning |
| **Qwen 3.8 (DashScope)** | Cloud / MoE | `https://dashscope.aliyuncs.com/compatible-mode/v1` | **2.4 Trillion Parameters**, Flagship MoE Preview |
| **OpenRouter** | Cloud Router API | `https://openrouter.ai/api/v1` | Multi-model routing, prompt caching, fallback |
| **Ollama** | Local Runner | `http://localhost:11434/v1` | Local inference, zero latency cost, offline |
| **LM Studio** | Local Server | `http://localhost:1234/v1` | Local GUI server, GGUF models |
| **llama.cpp** | Local Server | `http://localhost:8080/v1` | High performance C++ local inference |
| **vLLM** | Self-Hosted Server | `http://localhost:8000/v1` | High throughput batching & serving |
| **SiliconFlow** | Cloud API | `https://api.siliconflow.cn/v1` | High speed Qwen/DeepSeek hosting |
| **Groq** | Cloud LPU | `https://api.groq.com/openai/v1` | Ultra-fast token generation |
| **Together AI** | Cloud API | `https://api.together.xyz/v1` | Open models API |
| **Fireworks AI**| Cloud API | `https://api.fireworks.ai/inference/v1` | High speed function calling & vision |
| **DeepSeek** | Cloud API | `https://api.deepseek.com/v1` | DeepSeek-V3 / DeepSeek-R1 reasoning |
| **Qwen (DashScope)**| Cloud API | `https://dashscope.aliyuncs.com/compatible-mode/v1` | Qwen 2.5 Coder & Qwen 3.8 models |
| **Kimi (Moonshot)**| Cloud API | `https://api.moonshot.ai/v1` | 1M Context length |
| **GLM (Zhipu)** | Cloud API | `https://open.bigmodel.cn/api/paas/v4` | GLM-4 models |
| **OpenAI** | Direct API | `https://api.openai.com/v1` | GPT-4o, o1, o3-mini models |

---

## Core Interface Definition (`ILLMProvider`)

```typescript
export interface ILLMProvider {
  id: string;
  name: string;
  
  initialize(config: ProviderConfig): Promise<void>;
  listModels(): Promise<ModelInfo[]>;
  chat(request: ChatCompletionRequest): Promise<ChatCompletionResponse>;
  stream(request: ChatCompletionRequest): AsyncIterable<ChatCompletionChunk>;
  embeddings?(request: EmbeddingRequest): Promise<EmbeddingResponse>;
  health(): Promise<HealthStatus>;
  capabilities(): ProviderCapabilities;
}

export interface ProviderCapabilities {
  supportsStreaming: boolean;
  supportsTools: boolean;
  supportsVision: boolean;
  supportsPromptCache: boolean;
  maxContextTokens: number;
}
```

---

## Configuration Schema (`providers.json`)

```json
{
  "default": "kimi-k3",
  "fallback": ["qwen-3.8-max", "ollama-local"],
  "providers": [
    {
      "id": "kimi-k3",
      "name": "Kimi K3 (Moonshot AI - 1M Context)",
      "baseUrl": "https://api.moonshot.ai/v1",
      "apiKey": "${KIMI_API_KEY}",
      "model": "kimi-k3",
      "timeoutMs": 120000
    },
    {
      "id": "qwen-3.8-max",
      "name": "Qwen 3.8 (2.4T MoE - DashScope)",
      "baseUrl": "https://dashscope.aliyuncs.com/compatible-mode/v1",
      "apiKey": "${DASHSCOPE_API_KEY}",
      "model": "qwen3.8-max-preview",
      "timeoutMs": 120000
    }
  ]
}
```

---

**Arquivo:** providers.md  
**Localização:** `E:/00Dev/AntigravityUnlock/docs/`  
**Importância:** CRÍTICA  
**Versão:** 1.2.0  
**Última Revisão:** 25/07/2026 01:05:00 -03:00  
**Ver também:** `projects_registry.yaml` — SSOT de projetos
