# AG Universal AI

<p align="center">
  <img src="https://img.shields.io/badge/Status-Alpha-orange?style=for-the-badge&logo=github" alt="Status" />
  <img src="https://img.shields.io/badge/Platform-VS%20Code%20%7C%20Antigravity%20IDE-blue?style=for-the-badge&logo=visualstudiocode" alt="Platform" />
  <img src="https://img.shields.io/badge/Providers-11%2B-purple?style=for-the-badge&logo=openai" alt="Providers" />
  <img src="https://img.shields.io/badge/Version-0.1.0-green?style=for-the-badge" alt="Version" />
  <img src="https://img.shields.io/badge/License-MIT-brightgreen?style=for-the-badge" alt="License" />
</p>

<p align="center">
  <b>A powerful, multi-provider AI coding assistant extension for VS Code & Antigravity IDE.</b><br />
  Code completion, chat, agent workflows, MCP integration, and tool calling — powered by any OpenAI-compatible backend.
</p>

> [!IMPORTANT]
> **AG Universal AI** is a legitimate VS Code extension that uses official VS Code Extension APIs. It works with VS Code, Antigravity IDE, VSCodium, and any VS Code fork that supports the standard extension model.

---

## ✨ Features

### 🤖 Multi-Provider AI Chat (`@ag`)
- Native chat participant integrated into VS Code's chat panel
- Slash commands: `/explain`, `/refactor`, `/test`, `/fix`, `/docs`, `/review`
- Context-aware with `#file` and `#selection` references
- Streaming responses with conversation history

### 🔌 11+ Supported Providers (2 Local + 9 Cloud)

| Provider | Type | Key Features |
| :--- | :--- | :--- |
| **Ollama** | 🏠 Local | 100% offline, free, auto-model discovery |
| **LM Studio** | 🏠 Local | GGUF models, free, offline |
| **OpenAI** | ☁️ Cloud | GPT-4o, o1, o3-mini |
| **Groq** | ☁️ Cloud | Ultra-fast LPU inference |
| **OpenRouter** | ☁️ Cloud | Multi-model routing, free models available |
| **DashScope** | ☁️ Cloud | Qwen 3.8 (2.4T MoE), Qwen 2.5 Coder |
| **Moonshot AI** | ☁️ Cloud | Kimi K3, 1M token context |
| **DeepSeek** | ☁️ Cloud | V3, R1 reasoning models |
| **SiliconFlow** | ☁️ Cloud | Fast Qwen/DeepSeek hosting |
| **Together AI** | ☁️ Cloud | Open-source model hosting |
| **Fireworks AI** | ☁️ Cloud | High-speed function calling |

### 🔒 Secure by Design
- API keys stored in VS Code's encrypted `SecretStorage` — never on disk
- All processing runs through official VS Code Extension APIs
- No binary patching, no proxy interception, no protocol hacking

### 🎯 Smart Provider Management
- One-click provider switching via status bar or command palette
- Automatic fallback chain when a provider fails
- Real-time health monitoring for all providers
- Per-provider model selection with auto-discovery

---

## 🚀 Quick Start

### 1. Install the Extension

Install from Open VSX or load directly in VS Code / Antigravity IDE.

### 2. Configure a Provider

**For local inference (recommended for getting started):**
1. Install [Ollama](https://ollama.com)
2. Pull a model: `ollama pull qwen2.5-coder:14b`
3. The extension auto-detects Ollama on `localhost:11434`

**For cloud providers:**
1. Open Command Palette (`Ctrl+Shift+P`)
2. Run `AG AI: Set API Key for Provider`
3. Select your provider and enter your API key

### 3. Start Chatting

Open the Chat panel and type `@ag` followed by your question. Use slash commands for specialized tasks:

```
@ag /explain What does this function do?
@ag /refactor Simplify this code
@ag /test Generate tests for the selected code
@ag /fix There's a bug in the error handling
@ag /docs Add documentation to this module
@ag /review Review this PR for issues
```

---

## ⚙️ Configuration

All settings are available in VS Code Settings under `AG Universal AI`:

| Setting | Default | Description |
| :--- | :--- | :--- |
| `activeProvider` | `ollama-local` | Currently active provider |
| `activeModel` | *(provider default)* | Override model for active provider |
| `inlineCompletion.enabled` | `true` | Enable ghost text completions |
| `inlineCompletion.debounceMs` | `300` | Debounce delay for completions |
| `chat.temperature` | `0.7` | Chat response temperature |
| `chat.maxTokens` | `4096` | Max tokens per response |
| `fallbackProviders` | `[]` | Fallback provider chain |
| `customProvider.baseUrl` | *(empty)* | Custom endpoint URL |

---

## 🛣️ Roadmap

- [x] **Phase 1 (MVP)**: Provider system, chat participant, status bar
- [ ] **Phase 2**: Inline code completion, tool registry, agent engine
- [ ] **Phase 3**: MCP server, dashboard webview, tree view sidebar
- [ ] **Phase 4**: Full test suite, Open VSX publishing

---

## 📖 Documentation

- Architecture & Design: `./docs/architecture.md`
- Provider Specification: `./docs/providers.md`

---

## 📄 License

MIT — See [LICENSE](./LICENSE)

---

**Versão:** 0.1.0 | **Última Revisão:** 2026-07-29 19:45:00
