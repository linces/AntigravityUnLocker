# Supported Providers — AG Universal AI

## Overview

AG Universal AI supports any OpenAI-compatible API endpoint through a universal adapter pattern. Below are the built-in provider presets.

---

## Local Providers (Free, Offline)

| Provider | Default Model | Base URL | Notes |
| :--- | :--- | :--- | :--- |
| **Ollama** | `qwen2.5-coder:14b` | `http://localhost:11434` | Auto-model discovery, no API key |
| **LM Studio** | `local-model` | `http://localhost:1234/v1` | GGUF models, no API key |

## Cloud Providers

| Provider | Default Model | Base URL | Key Procurement |
| :--- | :--- | :--- | :--- |
| **OpenAI** | `gpt-4o` | `https://api.openai.com/v1` | [platform.openai.com](https://platform.openai.com/api-keys) |
| **Groq** | `llama-3.3-70b-versatile` | `https://api.groq.com/openai/v1` | [console.groq.com](https://console.groq.com/keys) |
| **OpenRouter** | `qwen/qwen-2.5-coder-32b-instruct` | `https://openrouter.ai/api/v1` | [openrouter.ai](https://openrouter.ai/settings/keys) |
| **DashScope** | `qwen3.8-max-preview` | `https://dashscope-intl.aliyuncs.com/compatible-mode/v1` | [dashscope.console.aliyun.com](https://dashscope.console.aliyun.com/apiKey) |
| **Moonshot AI** | `kimi-k3` | `https://api.moonshot.ai/v1` | [platform.moonshot.cn](https://platform.moonshot.cn/console/api-keys) |
| **DeepSeek** | `deepseek-chat` | `https://api.deepseek.com/v1` | [platform.deepseek.com](https://platform.deepseek.com/api_keys) |
| **SiliconFlow** | `Qwen/Qwen2.5-Coder-32B-Instruct` | `https://api.siliconflow.cn/v1` | [cloud.siliconflow.cn](https://cloud.siliconflow.cn/account/ak) |
| **Together AI** | `Qwen/Qwen2.5-Coder-32B-Instruct` | `https://api.together.xyz/v1` | [together.xyz](https://api.together.xyz/settings/api-keys) |
| **Fireworks AI** | `qwen2p5-coder-32b-instruct` | `https://api.fireworks.ai/inference/v1` | [fireworks.ai](https://fireworks.ai/account/api-keys) |
| **Z.ai (GLM)** | `glm-5.2` | `https://api.z.ai/api/coding/paas/v4` | [z.ai](https://z.ai/manage-apikey/apikey-list) |

---

## Custom Provider

You can connect to any OpenAI-compatible endpoint by configuring `ag-universal-ai.customProvider` in your VS Code settings:

```json
{
  "ag-universal-ai.activeProvider": "custom",
  "ag-universal-ai.customProvider": {
    "baseUrl": "http://your-server:8080/v1",
    "model": "your-model-name"
  }
}
```

Then set the API key via the command: `AG AI: Set API Key for Provider`.

---

## Provider Interface

All providers implement the `ILLMProvider` interface:

```typescript
interface ILLMProvider {
  readonly id: string;
  readonly name: string;
  readonly config: ProviderConfig;

  chat(request: ChatCompletionRequest): Promise<ChatCompletionResponse>;
  stream(request: ChatCompletionRequest, signal?: AbortSignal): AsyncIterable<string>;
  health(): Promise<HealthStatus>;
  capabilities(): ProviderCapabilities;
  listModels?(): Promise<ModelInfo[]>;
}
```

---

**Versão:** 0.3.1 | **Última Revisão:** 2026-08-05 18:44:00
