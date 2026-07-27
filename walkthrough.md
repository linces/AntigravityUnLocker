---
domain: dev
category: project_management
type: walkthrough
created: 2026-07-25
last_updated: 2026-07-25T12:12:00-03:00
version: 1.4.0
---

# Project Walkthrough - Antigravity Universal AI Provider

## Completed Work

### 1. Reverse Engineering Specifications & User Guides
- [user_manual.md](docs/user_manual.md): Comprehensive Operation & Usage Manual covering build, environment keys, IDE setup, dashboard usage, and diagnostics.
- [architecture.md](docs/architecture.md): Full breakdown of Antigravity IDE framework (Electron 39.2.3, VS Code 1.107.0 fork, Node.js 22.20.0), process tree, and internal ConnectRPC protocol loop.
- [providers.md](docs/providers.md): Ecosystem mapping for Ollama, OpenRouter, LM Studio, vLLM, DeepSeek, Qwen, SiliconFlow, Groq, Kimi K3, Qwen 3.8, GLM, OpenAI, and `ILLMProvider` interface specification.
- [network.md](docs/network.md): Headers, authorization tokens, Protobuf schema structure, ConnectRPC framing, and traffic instrumentation plan.
- [bridge.md](docs/bridge.md): Topology, operational responsibilities, and translation mechanisms for the `ag-provider` proxy server.
- [findings.md](docs/findings.md): Comprehensive summary of all discovery phases.
- [todo.md](todo.md) & [roadmap.md](roadmap.md): Task checklist and release roadmap.

### 2. Proxy Bridge, Vision & Tool Calling Pipeline (`src/ag-provider/`)
- [package.json](src/ag-provider/package.json): Node.js environment configuration with ESM support.
- [tsconfig.json](src/ag-provider/tsconfig.json): TypeScript setup.
- [providers.json](src/ag-provider/providers.json): Configuration template for target LLM backends (Kimi K3, Qwen 3.8 2.4T, Ollama, OpenRouter) and fallback rules.
- [base.ts](src/ag-provider/src/adapters/base.ts): `ILLMProvider` core interface & types with Multimodal & Tool Call support.
- [openai.ts](src/ag-provider/src/adapters/openai.ts): OpenAI-compatible adapter supporting `tools`, `tool_choice`, and multimodal payloads.
- [ollama.ts](src/ag-provider/src/adapters/ollama.ts): Ollama / local LLM runner adapter.
- [providerRouter.ts](src/ag-provider/src/router/providerRouter.ts): Dynamic router & automatic fallback engine.
- [visionTranslation.ts](src/ag-provider/src/translation/visionTranslation.ts): Translation of ConnectRPC `inlineData` base64 image parts into OpenAI `image_url` multimodal content payloads.
- [toolsTranslation.ts](src/ag-provider/src/translation/toolsTranslation.ts): Bidirectional translation between ConnectRPC `functionDeclarations` and OpenAI `tools`/`tool_calls`.
- [connectToOpenAI.ts](src/ag-provider/src/translation/connectToOpenAI.ts): ConnectRPC 5-byte header envelope decoder and multimodal/tool-aware request parser.
- [openAiToConnect.ts](src/ag-provider/src/translation/openAiToConnect.ts): ConnectRPC envelope encoder and SSE stream chunk formatter.
- [dashboardHtml.ts](src/ag-provider/src/dashboard/dashboardHtml.ts): Dark-mode web control panel interface (`/dashboard`).
- [index.ts](src/ag-provider/src/index.ts): HTTP/2 ConnectRPC server entrypoint.

### 4. Deep IDE Binary Analysis & `jetski.cloudCodeUrl` Fix
- **Root Cause Identified**: Decompiled `out/main.js` and `extensions/antigravity/dist/extension.js` inside the Antigravity IDE application package.
- **Discovery**: In `out/main.js`, `getBaseUrl()` fetches the endpoint override specifically via `this._configurationService.getValue("jetski.cloudCodeUrl")`. Environment variable `$env:CLOUD_CODE_ENDPOINT` alone is bypassed by the language server process launcher (`language_server_windows_x64.exe`).
- **Fix Applied**: Updated `.test-ide-profile/User/settings.json` to include `"jetski.cloudCodeUrl": "http://127.0.0.1:50051"` alongside `"antigravity.agentHostAddress"`.
- **Launcher Created**: Added `scripts/open-proxied-ide.bat` to launch the IDE with all required settings and environment variables automatically initialized.

---

**Versão:** 1.5.0 | **Última Revisão:** 2026-07-27 01:16:00
