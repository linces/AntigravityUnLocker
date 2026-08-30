# Changelog — AG Universal AI

All notable changes to the **AG Universal AI** extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.6.0] - 2026-08-30

### Added & Enhanced
- **Direct MCP Client Engine (`MCPClientManager`)**: Implemented full JSON-RPC 2.0 client over stdio, connecting directly to external MCP servers (Postgres, Git, Filesystem, Playwright, SQLite, Fetch) configured in `.vscode/mcp.json` or settings (`ag-universal-ai.mcpServers`), and dynamically binding tools into `ToolRegistry`.
- **Interactive Diff Preview (`AGDiffProvider`)**: Added virtual document content provider on scheme `ag-diff://` for side-by-side inspection (`vscode.diff`) before applying proposed code edits.
- **Embedded MCP Server Full Alignment**: Added official schemas for `ag_replaceInFile`, `ag_multiReplaceInFile`, `ag_getSelection`, and `ag_getDiagnostics` to `getMCPToolDefinitions()`.
- **Dynamic Tool Dispatching**: Extended `ToolRegistry` with `registerDynamicTool` and `unregisterDynamicTools` to support real-time MCP tool additions and removals.
- **Expanded Test Suite**: Added `test/mcp-client.test.ts` and `test/diff-provider.test.ts` bringing the automated test suite to 22 passing tests.

---

## [0.5.8] - 2026-08-30

### Added & Fixed
- **Agent Engine Fallback Tool Parser**: Implemented robust text JSON and codeblock tool call extraction (`extractToolCallsFromText`) in `AgentEngine`, allowing models without native function calling support (e.g. local Ollama models) to execute tools autonomously.
- **ToolRegistry Cleanup & Sanitization**: Removed duplicated properties and eliminated phantom `getCachedCompletion` / `buildCompletionPrompt` references from `ToolRegistry`.
- **Path Traversal Hardening**: Enforced strict root path containment with `path.posix.normalize` in `FileTools.resolveUri` and `EditTools.resolveUri`.
- **AbortSignal Propagation**: Added optional `signal` support in `ChatCompletionRequest`, `OpenAIAdapter.chat()`, and `AGInlineCompletionProvider` for immediate cancellation of in-flight completion requests.
- **Expanded Unit Test Suite**: Added dedicated unit tests for `EditTools` (`replaceInFile`, `multiReplaceInFile`, traversal blocking) and `AgentEngine` text JSON execution, expanding coverage to 20 automated tests.

---

## [0.5.3] - 2026-08-07

### Added & Fixed
- **Webview Event Binds & Input Trapping**: Direct `addEventListener` input trapping on `<textarea>` and toolbar buttons with `preventDefault()` and `stopPropagation()` to prevent unwanted newline insertions on Enter key.
- **IPC API Singleton Caching**: Captured `acquireVsCodeApi()` once into `window.__agVscApi` to prevent re-acquisition runtime exceptions.
- **Unit Test Suite**: 14 mocha/esbuild unit tests covering Provider Registry, MCP Protocol, OpenAI Adapter, ProviderManager, and SessionManager.
- **Status Bar Integration**: Enhanced latency and active model status display.

---

## [0.5.2] - 2026-08-06

### Added & Fixed
- **Precision Code Edits**: Added `ag_replaceInFile` and `ag_multiReplaceInFile` substring replacement tools.
- **Robust Path Validation**: Enhanced workspace relative path resolution and error trapping across file tools.

---

## [0.5.1] - 2026-08-06

### Added & Fixed
- **Multi-Session Dynamic Switcher**: Multi-session management with auto-titling and session persistence in `workspaceState`.
- **Webview Script Optimization**: Bundled webview script template generation for sub-5ms render response.

---

## [0.5.0] - 2026-08-06

### Added & Fixed
- **Multi-Persona SynAI Agent Harness**: Support for Supervisor, Planner, Code, Review, Security, Docs, and Database agent personas.
- **Direct MCP Integration**: Protocol handling for official and community MCP servers over `stdio` and `SSE`.
- **12+ AI Provider Presets**: Presets including Ollama, LM Studio, OpenAI, Groq, OpenRouter, DashScope Qwen, Kimi K3, DeepSeek, SiliconFlow, Together AI, Fireworks AI, and Z.ai GLM-5.2.

---

## [0.4.5] - 2026-08-06

### Fixed & Self-Healing Webview IPC Handshake
- **Dynamic API Acquisition (`getVsc()`)**: Replaced static `vsc = getVsc()` initialization with dynamic runtime resolution across all click handlers, dropdown listeners, and send routines to eliminate silent UI drops.
- **Heartbeat Self-Healing Handshake**: Implemented 1000ms periodic `{ type: 'ready' }` retry loop during webview initialization to guarantee state hydration (`selSession`, `history`, `providers`) even under iframe mount latency.
- **Resilient Stream Lock Recovery**: Ensured `streamEl` state resets immediately (`streamEl = null`) if IPC is unavailable during `doSend()`, preventing 12-second UI button blockages.

---

## [0.4.4] - 2026-08-06

### Fixed & Bulletproof IPC Architecture
- **Dual-Layer Redundant IPC Event Delegation**: Added inline `onclick="window.__agPost('...')"` handlers to HTML buttons alongside document-level event delegation.
- **Dynamic API Acquisition (`getVsc`)**: Added `getVsc()` lazy API resolver on client script execution and exposed `window.__agPost` and `window.__agSend` globally.
- **Visual Connection Error Diagnostics**: Added `#agWebviewStatus` banner to render immediate actionable error messages if VS Code API is ever disconnected.
- **Unrestricted CSP Policy**: Expanded CSP policy header to permit `script-src 'unsafe-inline' 'unsafe-eval'` to guarantee zero CSP script blocks in VS Code / Antigravity IDE.

---

## [0.4.3] - 2026-08-06

### Fixed & Critical Resolution
- **Eliminated Webview Runtime Syntax Error**: Replaced double-escaped `new RegExp(...)` constructor strings with compile-safe RegExp literals (`/.../g`). Fixed silent runtime `SyntaxError: Invalid escape` in Chromium Webview script that killed `ready` IPC signals and button event listeners.

---

## [0.4.2] - 2026-08-06

### Fixed & Enhanced
- **Failsafe Webview API Singleton**: Implemented `window.__agVscApi` singleton caching pattern to prevent duplicate `acquireVsCodeApi()` exceptions during Webview re-renders and IPC silent drops.
- **Bounded Model Listing (`Promise.race`)**: Enforced a strict 3000ms timeout on provider model queries (`listModels()`), eliminating session select deadlocks when remote AI cloud services experience network latency.
- **Multi-Stage Hydration Retries**: Added scheduled optimistic state updates at 0ms, 300ms, and 1000ms to eliminate Webview mounting race conditions.
- **Stale Stream Auto-Reset**: Added 12-second stale stream indicator reset in `doSend()` to prevent UI button lockups.

---

## [0.4.1] - 2026-08-06

### Fixed & Enhanced
- **Webview UI Syntax Resilience**: Solved root-level script parsing crash in webview template string generator (`getScript()`). Restored 100% IPC responsiveness for Send, Dashboard, Clear, New Session, and Attach File buttons.
- **Central Domain Synchronization**: Promoted Webview IPC resilience invariants and Direct MCP Architecture patterns to the central transversal domain hub (`E:\00Dev\agent skills e mais prod`).

---

## [0.4.0] - 2026-08-06

### Added
- **Single Core Architecture & Direct MCP Strategy**:
  - Direct connection to official and open-source MCP servers (`@modelcontextprotocol/sdk`) via `stdio`/`SSE`.
  - Matrix of recommended MCP servers (Filesystem, Git/GitHub, Postgres, Playwright, SQLite, Fetch, Docker, Memory).
  - Embedded AI Gateway layer for native multi-provider routing and token usage tracking.
  - Embedded SynAI sub-agent harness with multi-persona capability (Supervisor, Planner, Code, Review, Security, Database).

### Fixed
- Fixed TypeScript compilation errors (`TS2345`, `TS2353`, `TS2304`, `TS2341`) in `provider-manager.ts`, `session-manager.ts`, `types.ts`, `file-tools.ts`, and `sidebar-webview.ts`.
- Restored Markdown rendering and code block styling in sidebar chat webview.
- Enforced clean metadata footers across all `.md` documentation files according to `[dev]` transversal domain rules.

---

## [0.1.0] - 2026-07-30

### Added
- **Multi-Provider Engine**: Support for Ollama, LM Studio, OpenAI, Groq, OpenRouter, DashScope, Moonshot AI, DeepSeek, SiliconFlow, Together AI, Fireworks AI.
- **Interactive AI Chat (`@ag`)**: Native chat participant and custom sidebar webview panel.
- **Ghost Text Inline Completion**: Real-time Fill-in-the-Middle code suggestions.
- **Embedded MCP Server**: JSON-RPC 2.0 workspace tools and resources server.

---

**Versão:** 0.6.0 | **Última Revisão:** 2026-08-30 17:53:00
