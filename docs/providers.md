# Target Providers & Adapter Specification - Antigravity Universal AI Provider

## Overview

This document specifies the target AI provider ecosystem, capability requirements, configuration structure, and the standard `ILLMProvider` interface powering the `ag-provider` compatibility layer.

---

## Supported Providers

| Provider | Access Model | Base URL / Protocol | Key Features |
| :--- | :--- | :--- | :--- |
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
| **Qwen (DashScope)**| Cloud API | `https://dashscope.aliyuncs.com/compatible-mode/v1` | Qwen 2.5 Coder models |
| **Kimi (Moonshot)**| Cloud API | `https://api.moonshot.cn/v1` | Long context length |
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
  "default": "qwen-coder",
  "fallback": ["deepseek-chat", "ollama-local"],
  "providers": [
    {
      "id": "qwen-coder",
      "name": "Qwen 2.5 Coder 32B",
      "adapter": "openai-compatible",
      "baseUrl": "https://api.siliconflow.cn/v1",
      "apiKey": "${SILICONFLOW_API_KEY}",
      "model": "Qwen/Qwen2.5-Coder-32B-Instruct",
      "timeoutMs": 60000,
      "maxRetries": 3
    },
    {
      "id": "ollama-local",
      "name": "Ollama Local Code",
      "adapter": "ollama",
      "baseUrl": "http://localhost:11434/v1",
      "apiKey": "ollama",
      "model": "qwen2.5-coder:14b",
      "timeoutMs": 120000
    }
  ]
}
```
