# Project Walkthrough - Antigravity Universal AI Provider

## Completed Work

### 1. Reverse Engineering Specifications
- [architecture.md](docs/architecture.md): Full breakdown of Antigravity IDE framework (Electron 39.2.3, VS Code 1.107.0 fork, Node.js 22.20.0), process tree, and internal ConnectRPC protocol loop.
- [providers.md](docs/providers.md): Ecosystem mapping for Ollama, OpenRouter, LM Studio, vLLM, DeepSeek, Qwen, SiliconFlow, Groq, Kimi, GLM, OpenAI, and `ILLMProvider` interface specification.
- [network.md](docs/network.md): Headers, authorization tokens, Protobuf schema structure, ConnectRPC framing, and traffic instrumentation plan.
- [bridge.md](docs/bridge.md): Topology, operational responsibilities, and translation mechanisms for the `ag-provider` proxy server.
- [findings.md](docs/findings.md): Comprehensive summary of all discovery phases.
- [todo.md](todo.md) & [roadmap.md](roadmap.md): Task checklist and release roadmap.

### 2. Proxy Bridge & Dashboard (`src/ag-provider/`)
- [package.json](src/ag-provider/package.json): Node.js environment configuration.
- [tsconfig.json](src/ag-provider/tsconfig.json): TypeScript setup.
- [providers.json](src/ag-provider/providers.json): Configuration template for target LLM backends and fallback rules.
- [base.ts](src/ag-provider/src/adapters/base.ts): `ILLMProvider` core interface & types.
- [openai.ts](src/ag-provider/src/adapters/openai.ts): OpenAI-compatible adapter for cloud API providers.
- [ollama.ts](src/ag-provider/src/adapters/ollama.ts): Ollama / local LLM runner adapter.
- [providerRouter.ts](src/ag-provider/src/router/providerRouter.ts): Dynamic router with runtime provider switching & automatic fallback engine.
- [connectToOpenAI.ts](src/ag-provider/src/translation/connectToOpenAI.ts): ConnectRPC 5-byte header envelope decoder and payload request parser.
- [openAiToConnect.ts](src/ag-provider/src/translation/openAiToConnect.ts): ConnectRPC envelope encoder and SSE stream chunk formatter.
- [dashboardHtml.ts](src/ag-provider/src/dashboard/dashboardHtml.ts): Dark-mode web control panel interface.
- [index.ts](src/ag-provider/src/index.ts): HTTP/2 ConnectRPC server entrypoint with support for binary `application/connect+proto`, web dashboard (`/dashboard`), and REST endpoints.

### 3. Safety & Compliance
- Zero binary modifications or patches to the host IDE.
- Completely non-intrusive, operating out-of-band via standard configuration.
