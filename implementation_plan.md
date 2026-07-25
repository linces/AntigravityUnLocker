# Implementation Plan - Antigravity Universal AI Provider

Architectural documentation and development of an intermediate compatibility proxy bridge (`ag-provider`) for Antigravity IDE, enabling standard OpenAI-compatible backends (Ollama, LM Studio, OpenRouter, vLLM, DeepSeek, Qwen) while retaining all IDE authentication, licensing, and security guarantees intact.

## Key Technical Discoveries

1. **Host Architecture**:
   - **Runtime**: Electron 39.2.3, Node.js 22.20.0 (VS Code 1.107.0 core fork).
   - **Core Bundles**: `out/main.js`, `out/jetskiAgent/main.js`, `extensions/antigravity/dist/extension.js`.
2. **RPC Mechanism**:
   - **Protocol**: Protocol Buffers (`@bufbuild/protobuf`) & ConnectRPC (`@connectrpc/connect`, `@connectrpc/connect-node`).
   - **State Engine**: Unified State Sync (`uss-agentPreferences`, `uss-userStatus`, `uss-oauth`).
   - **Config Hook**: `agentHostAddress` setting allows setting a custom host for agent RPC services.

---

## User Review Required

> [!IMPORTANT]
> - **Official Mechanisms First**: In accordance with project instructions, all existing native configurations (such as `agentHostAddress` and gRPC/ConnectRPC transport overrides) will be utilized prior to proposing any deeper binary modifications.
> - **Non-destructive & Reversible**: No files in `C:\Users\lince\AppData\Local\Programs\Antigravity IDE` will be edited without prior backups.

---

## Proposed Changes & Deliverables

### Workspace Documentation (`E:\00Dev\AntigravityUnlock\`)

#### [NEW] [architecture.md](file:///E:/00Dev/AntigravityUnlock/architecture.md)
Detailed breakdown of Antigravity IDE technology stack, Electron architecture, process breakdown, and internal ConnectRPC messaging loop.

#### [NEW] [providers.md](file:///E:/00Dev/AntigravityUnlock/providers.md)
Catalog of target LLM backends (Ollama, LM Studio, OpenRouter, vLLM, SiliconFlow, Groq, DeepSeek, Qwen, Kimi, GLM) and capability mappings (`ILLMProvider`).

#### [NEW] [network.md](file:///E:/00Dev/AntigravityUnlock/network.md)
Protobuf schema analysis, headers, authorization mechanism, SSE streaming structures, and payload specifications.

#### [NEW] [bridge.md](file:///E:/00Dev/AntigravityUnlock/bridge.md)
Specification for the `ag-provider` proxy process, endpoint routing, translation logic between ConnectRPC and OpenAI-compatible API schemas.

#### [NEW] [findings.md](file:///E:/00Dev/AntigravityUnlock/findings.md)
Full reverse-engineering report summarizing discovery phases 1 to 6.

#### [NEW] [todo.md](file:///E:/00Dev/AntigravityUnlock/todo.md) & [roadmap.md](file:///E:/00Dev/AntigravityUnlock/roadmap.md)
Task checklist and future development roadmap for multi-backend features (dynamic switching, prompt caching, load balancing).

---

### Bridge Service (`E:\00Dev\AntigravityUnlock\src\ag-provider\`)

#### [NEW] [package.json](file:///E:/00Dev/AntigravityUnlock/src/ag-provider/package.json)
Node.js/TypeScript workspace for `ag-provider` service with `@connectrpc/connect`, `@bufbuild/protobuf`, and OpenAI SDK dependencies.

#### [NEW] [providers.json](file:///E:/00Dev/AntigravityUnlock/src/ag-provider/providers.json)
Configuration file for standard OpenAI-compatible endpoints, active model selection, retries, and fallback rules.

#### [NEW] [index.ts](file:///E:/00Dev/AntigravityUnlock/src/ag-provider/src/index.ts)
Bridge entry point running local ConnectRPC HTTP/2 server that proxies to OpenAI API formats.

---

## Verification Plan

### Automated Verification
1. `npm test` inside `ag-provider` to verify payload conversion between ConnectRPC Protobuf messages and OpenAI `chat/completions` request/response schemas.
2. Endpoint health check verification for configured providers (Ollama, LM Studio, OpenRouter).

### Manual Verification
1. Validate connectivity by running `ag-provider` locally and checking model listings and streaming responses.
2. Confirm documentation generated across all requested `.md` technical reports.
