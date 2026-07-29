# Architecture — AG Universal AI Extension

## Overview

AG Universal AI is a VS Code extension that provides multi-provider AI assistance through official VS Code Extension APIs. It connects to any OpenAI-compatible backend (local or cloud) and exposes AI capabilities through:

1. **Chat Participant (`@ag`)** — Native chat integration with slash commands
2. **Language Model Chat Provider** — Registers models in VS Code's model picker
3. **Inline Completion Provider** — Ghost text code suggestions (Phase 2)
4. **Tool Registry** — LM Tools API for agentic workflows (Phase 2)
5. **MCP Server** — Model Context Protocol integration (Phase 3)

---

## Component Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   AG Universal AI                       │
│                  VS Code Extension                      │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │  Language     │  │   Inline     │  │    Chat      │  │
│  │  Model Chat   │  │  Completion  │  │  Participant │  │
│  │  Provider     │  │   Provider   │  │  (@ag)       │  │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  │
│         │                 │                  │          │
│  ┌──────┴─────────────────┴──────────────────┴───────┐  │
│  │              Provider Manager                     │  │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌────────┐  │  │
│  │  │ OpenAI  │ │ Ollama  │ │ Groq    │ │Custom  │  │  │
│  │  │ Adapter │ │ Adapter │ │ Adapter │ │Adapter │  │  │
│  │  └─────────┘ └─────────┘ └─────────┘ └────────┘  │  │
│  └───────────────────────────────────────────────────┘  │
│                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │  Tool        │  │    MCP       │  │   Agent      │  │
│  │  Registry    │  │   Server     │  │   Engine     │  │
│  │  (LM Tools)  │  │  (stdio)     │  │  (Agentic)   │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
│                                                         │
│  ┌──────────────────────────────────────────────────┐   │
│  │  UI Layer                                        │   │
│  │  ┌──────────┐ ┌──────────┐ ┌─────────────────┐  │   │
│  │  │Status Bar│ │Tree View │ │ Webview Panel   │  │   │
│  │  │(Provider)│ │(Providers│ │ (Dashboard)     │  │   │
│  │  │          │ │ & Models)│ │                 │  │   │
│  │  └──────────┘ └──────────┘ └─────────────────┘  │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

---

## Key Design Decisions

### 1. OpenAI Format as Lingua Franca
All providers communicate using the OpenAI `v1/chat/completions` API format. This is the de-facto standard supported by virtually every AI backend.

### 2. Adapter Pattern for Providers
Each provider implements the `ILLMProvider` interface. The `OpenAIAdapter` serves as the universal base, with specialized adapters (e.g., `OllamaAdapter`) adding provider-specific features.

### 3. SecretStorage for API Keys
All API keys are stored in VS Code's encrypted `SecretStorage`. No credentials are ever written to disk files (`.env`) or stored in settings.

### 4. Configuration-Driven
Provider settings are exposed through VS Code's standard `contributes.configuration` system, making them editable via the Settings UI and `settings.json`.

### 5. Event-Driven Architecture
The `ProviderManager` emits events (`onDidChangeProvider`, `onDidChangeHealth`) that UI components (StatusBar, TreeView) react to automatically.

---

## Technology Stack

| Component | Technology |
| :--- | :--- |
| Language | TypeScript (strict mode) |
| Runtime | VS Code Extension Host (Node.js) |
| Build | esbuild (single-file bundle) |
| API Communication | Native `fetch` (Node.js 22+) |
| Security | VS Code SecretStorage |
| Testing | Mocha + @vscode/test-electron |

---

**Versão:** 3.0.0 | **Última Revisão:** 2026-07-29 19:45:00
