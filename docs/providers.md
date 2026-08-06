# Supported Providers & Direct MCP — AG Universal AI

## Overview

O **AG Universal AI** oferece suporte nativo a qualquer endpoint compatível com o padrão OpenAI API (`v1/chat/completions`) através de um padrão de adaptadores universais (`ILLMProvider`), além de permitir conexão direta a servidores MCP via `stdio`.

---

## Provedores Locais (Gratuitos & Offline)

| Provedor | Modelo Padrão | Base URL | Observações |
| :--- | :--- | :--- | :--- |
| **Ollama** | `qwen2.5-coder:14b` | `http://localhost:11434` | Descoberta automática de modelos, 100% offline |
| **LM Studio** | `local-model` | `http://localhost:1234/v1` | Execução de modelos GGUF locais |

---

## Provedores em Nuvem

| Provedor | Modelo Padrão | Base URL | Obtenção de Chave |
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

## Provedor Customizado

Para conectar a qualquer endpoint customizado compatível com OpenAI, configure a chave `ag-universal-ai.customProvider` no `settings.json`:

```json
{
  "ag-universal-ai.activeProvider": "custom",
  "ag-universal-ai.customProvider": {
    "baseUrl": "http://seu-servidor-local:8080/v1",
    "model": "nome-do-modelo"
  }
}
```

---

## Conexão Direta a Servidores MCP (Direct MCP Configuration)

No modelo Single Core, os MCPs são configurados diretamente via VS Code Settings:

```json
{
  "agUniversal.mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "."]
    },
    "postgres": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-postgres", "postgresql://localhost/mydb"]
    }
  }
}
```

---

## Interface Universal de Provedores (`ILLMProvider`)

```typescript
export interface ILLMProvider {
  readonly id: string;
  readonly name: string;
  readonly config: ProviderConfig;

  chat(request: ChatCompletionRequest): Promise<ChatCompletionResponse>;
  stream(request: ChatCompletionRequest, signal?: AbortSignal): AsyncIterable<string>;
  health(): Promise<HealthStatus>;
  capabilities(): ProviderCapabilities;
  listModels?(): Promise<ModelInfo[]>;
  updateModel?(model: string): void;
}
```

---

**Versão:** 0.4.2 | **Última Revisão:** 2026-08-06 19:03:00
