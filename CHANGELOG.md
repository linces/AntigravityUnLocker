# Changelog — AG Universal AI

All notable changes to the **AG Universal AI** extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.1.0] - 2026-07-30

### Added
- **Multi-Provider Engine**:
  - Support for 11+ OpenAI-compatible providers: Ollama (local), LM Studio (local), OpenAI, Groq, OpenRouter, DashScope (Qwen), Moonshot AI (Kimi), DeepSeek, SiliconFlow, Together AI, Fireworks AI.
  - Automatic fallback provider chain on API failures.
  - API keys stored securely in VS Code encrypted `SecretStorage` + local `.env` bootstrap mechanism.

- **Interactive AI Chat (`@ag`)**:
  - Native chat participant integrated into VS Code chat panel.
  - Slash commands: `/explain`, `/refactor`, `/test`, `/fix`, `/docs`, `/review`.
  - Context assembly for `#file` and `#selection` references.
  - Custom Activity Bar sidebar webview panel (`ag-sidebar`).

- **Ghost Text Inline Completion**:
  - FIM (Fill-in-the-Middle) prompt construction for real-time code suggestions.
  - Configurable debounce delay and LRU memory cache.

- **Embedded Model Context Protocol (MCP) Server**:
  - Full JSON-RPC 2.0 implementation exposing workspace tools and resources.
  - Standardized tool schemas (`ag_readFile`, `ag_writeFile`, `ag_listFiles`, `ag_runCommand`, `ag_searchWorkspace`).

- **Plan-Then-Act Autonomous Agent**:
  - Step-by-step task decomposition via `AgentPlanner`.
  - Execution loop with tool calling, progress reporting, and user confirmation guards.

- **Real-Time Telemetry & Dashboard**:
  - Live metric tracking (requests, latency, prompt/completion tokens, success rates).
  - Event-driven reactive webview dashboard (`AG AI: Show Dashboard`) with 1-click active provider switching.
  - Stream reader lock safety and crash-proof IPC messaging.

- **Test Suite & Packaging**:
  - Automated unit test runner with Mocha and esbuild mock alias support (`npm test`).
  - High-resolution extension branding icon (`resources/icons/ag-icon.png`).
  - VSIX packaging workflow (`npm run package`).

---

**Versão:** 0.1.0 | **Última Revisão:** 2026-07-30 14:14:00
