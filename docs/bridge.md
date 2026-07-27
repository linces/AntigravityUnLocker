---
domain: dev
category: bridge_architecture
type: documentation
created: 2026-07-25
last_updated: 2026-07-25T01:09:00-03:00
version: 1.2.0
---

# Bridge Architecture - ag-provider

> [!IMPORTANT]
> **CRITICAL ARCHITECTURE FACT**:
> The model selector dropdown **inside the Antigravity IDE UI** (e.g., *Gemini 3.6 Flash*) is **purely a visual frontend label**. Setting `CLOUD_CODE_ENDPOINT = "http://127.0.0.1:50051"` reroutes **100% of network traffic locally**. The **actual LLM engine** that responds to your prompts is chosen dynamically in the **Web Control Dashboard (`http://127.0.0.1:50051/dashboard`)**. Google servers receive ZERO requests, ZERO tokens are consumed from Google, and quota is NEVER affected!

## Overview

`ag-provider` is a local intermediate proxy server designed to bridge Antigravity IDE's ConnectRPC client requests with any standard OpenAI-compatible LLM inference server.

---

## 1. System Topology

```
+-------------------+           ConnectRPC           +-------------------+
|  Antigravity IDE  |  --------------------------->  |    ag-provider    |
|   (Electron App)  |   http://127.0.0.1:50051       |   (Local Bridge)  |
+-------------------+                                +-------------------+
                                                               |
                                                               | OpenAI v1 API
                                                               v
                                                     +-------------------+
                                                     | Target Provider   |
                                                     | (Ollama / Qwen /  |
                                                     | OpenRouter / etc) |
                                                     +-------------------+
```

---

## 2. Core Responsibilities

1. **Protocol Bridging**:
   - Host HTTP/2 ConnectRPC endpoints (`/google.cloud.conversa.v1.AgentService/*`).
   - Decode Protobuf request messages into standardized internal representations.
   - Stream HTTP/2 SSE responses converted from OpenAI delta chunks.

2. **Provider Adapters (`ILLMProvider`)**:
   - Dynamic routing based on `providers.json` configuration.
   - Request transform (system prompt wrapping, function call translation).
   - Tool calling adapter (converting OpenAI function calls into IDE tool response payloads).

3. **Resilience & Features**:
   - **Automatic Fallback**: Fallback to secondary provider if primary model returns 5xx / timeout.
   - **Retry Mechanism**: Exponential backoff on rate limits.
   - **Local Dashboard**: Lightweight HTTP server monitoring latency, active provider, token count, and memory usage.

---

## 3. Directory Layout (`src/ag-provider/`)

```
src/ag-provider/
├── package.json
├── tsconfig.json
├── providers.json
├── src/
│   ├── index.ts                # Main entrypoint & ConnectRPC server
│   ├── config.ts               # Configuration & providers.json loader
│   ├── server.ts               # Express / HTTP server + Dashboard API
│   ├── adapters/
│   │   ├── base.ts             # ILLMProvider interface
│   │   ├── openai.ts           # OpenAI / OpenRouter / DeepSeek / SiliconFlow adapter
│   │   └── ollama.ts           # Ollama / LM Studio adapter
│   ├── router/
│   │   └── providerRouter.ts   # Fallback & model selection logic
│   └── translation/
│       ├── connectToOpenAI.ts  # Protobuf -> OpenAI ChatCompletion request
│       └── openAiToConnect.ts  # OpenAI delta -> ConnectRPC SSE frame
└── dashboard/                  # Local web management interface
```

---

**Versão:** 1.2.0 | **Última Revisão:** 2026-07-25 01:09:00 -03:00
