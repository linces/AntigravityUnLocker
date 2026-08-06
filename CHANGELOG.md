# Changelog — AG Universal AI

All notable changes to the **AG Universal AI** extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

**Versão:** 0.4.0 | **Última Revisão:** 2026-08-06 18:35:00
