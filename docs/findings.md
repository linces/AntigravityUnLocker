---
domain: dev
category: findings_summary
type: documentation
created: 2026-07-25
last_updated: 2026-07-25T01:05:00-03:00
version: 1.2.0
project_registry: projects_registry.yaml
---

# Findings Report - Reverse Engineering Antigravity IDE

## Key Discoveries & Technical Insights

### 1. Engine & Runtime
- **Core Engine**: Antigravity IDE is built on a customized Google fork of VS Code (`1.107.0`), executing within Electron `39.2.3` and Node.js `22.20.0`.
- **Packaging**: Standard Electron application hierarchy with node modules and main webpack bundles (`out/main.js`, `out/jetskiAgent/main.js`, `extensions/antigravity/dist/extension.js`).

### 2. Network & RPC Architecture
- **Protocol**: Binary **Protocol Buffers** (`@bufbuild/protobuf`) over **ConnectRPC** (`@connectrpc/connect`, `@connectrpc/connect-node`).
- **Endpoint Target**: `cloudaicompanion.googleapis.com` (Google Cloud AI Companion / Conversa service).
- **Communication Flow**:
  1. The IDE agent engine packages project context, prompt messages, active tools, and diff histories into Protobuf payload structures.
  2. The payload is transmitted over an HTTP/2 ConnectRPC stream.
  3. The response is streamed chunk-by-chunk via gRPC/Connect server-sent frames.

### 3. Native Extension Points
- **Configuration Hooks**: Antigravity IDE manages agent preferences through Unified State Sync (`uss-agentPreferences`).
- **Custom Agent Host Hook**: Setting key `pa.AGENT_HOST_ADDRESS` (`agentHostAddressSentinelKey`) allows configuring custom target endpoints for agent RPC services.

### 4. Integration Strategy (`ag-provider`)
- By leveraging the standard host override mechanism, an external proxy process (`ag-provider`) listening on `127.0.0.1` can intercept ConnectRPC calls.
- `ag-provider` translates incoming binary ConnectRPC messages into standard OpenAI `v1/chat/completions` API format, enabling seamless usage of local runners (Ollama, LM Studio, llama.cpp) and alternative cloud endpoints (OpenRouter, DeepSeek, Qwen, vLLM, SiliconFlow).

---

**Arquivo:** findings.md  
**Localização:** `E:/00Dev/AntigravityUnlock/docs/`  
**Importância:** CRÍTICA  
**Versão:** 1.2.0  
**Última Revisão:** 25/07/2026 01:05:00 -03:00  
**Ver também:** `projects_registry.yaml` — SSOT de projetos
