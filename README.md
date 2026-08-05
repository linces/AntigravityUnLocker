# AG Universal AI

<p align="center">
  <img src="https://img.shields.io/badge/Status-Active-brightgreen?style=for-the-badge&logo=github" alt="Status" />
  <img src="https://img.shields.io/badge/Platform-VS%20Code%20%7C%20Antigravity%20IDE-blue?style=for-the-badge&logo=visualstudiocode" alt="Platform" />
  <img src="https://img.shields.io/badge/Providers-12%2B-purple?style=for-the-badge&logo=openai" alt="Providers" />
  <img src="https://img.shields.io/badge/Version-0.4.0-green?style=for-the-badge" alt="Version" />
  <img src="https://img.shields.io/badge/License-MIT-brightgreen?style=for-the-badge" alt="License" />
</p>

<p align="center">
  <b>A powerful, multi-provider AI coding assistant extension for VS Code & Antigravity IDE.</b><br />
  Code completion, chat, agent workflows, MCP integration, real-time telemetry, and tool calling — powered by any OpenAI-compatible backend.
</p>

> [!IMPORTANT]
> **AG Universal AI** is a legitimate VS Code extension that uses official VS Code Extension APIs. It works with VS Code, Antigravity IDE, VSCodium, and any VS Code fork that supports the standard extension model.

---

## ✨ Features

### 🤖 Multi-Provider AI Chat & Session Persistence (`@ag` & Qodo / Cursor Style Sidebar)
- **Chat Session Persistence**: Multi-session chat history persisted in VS Code `workspaceState`. Create new sessions (`➕`), switch between past chats (`📜 History`), auto-name sessions from initial prompt, and delete sessions (`🗑️`).
- Native chat participant integrated into VS Code's chat panel and custom Sidebar Webview (`ag-sidebar`)
- Qodo & Cursor Style Integrated Input Card — Sleek input box with embedded `+ Agent` mode pill, `⚡ Model / Provider` selector pill, API key status, slash command chips, and `Send ⬆` pill button
- Dynamic Provider & Model Switcher — switch active AI provider and select specific model per provider with real-time sync across Sidebar, Status Bar (`$(robot) AG AI: Provider (Model)`), QuickPick, and Dashboard
- Slash commands: `/explain`, `/refactor`, `/test`, `/fix`, `/docs`, `/review`
- Context-aware with `#file` and `#selection` references
- Real-time streaming responses with fallback provider chain

### 🔌 12+ Supported Providers (2 Local + 10 Cloud)

| Provider | Type | Key Features |
| :--- | :--- | :--- |
| **Ollama** | 🏠 Local | 100% offline, free, auto-model discovery |
| **LM Studio** | 🏠 Local | GGUF models, free, offline |
| **OpenAI** | ☁️ Cloud | GPT-4o, o1, o3-mini |
| **Groq** | ☁️ Cloud | Ultra-fast LPU inference |
| **NVIDIA NIM** | ☁️ Cloud | Llama-3.3-70b, Nemotron-70b, DeepSeek-R1 |
| **OpenRouter** | ☁️ Cloud | Multi-model routing, free models available |
| **DashScope** | ☁️ Cloud | Qwen 3.8 (2.4T MoE), Qwen 2.5 Coder |
| **Moonshot AI** | ☁️ Cloud | Kimi K3, 1M token context |
| **DeepSeek** | ☁️ Cloud | V3, R1 reasoning models |
| **SiliconFlow** | ☁️ Cloud | Fast Qwen/DeepSeek hosting |
| **Together AI** | ☁️ Cloud | Open-source model hosting |
| **Fireworks AI** | ☁️ Cloud | High-speed function calling |
| **Z.ai (GLM)** | ☁️ Cloud | GLM-5.2 flagship open-source, 1M context |

### 📊 Real-Time Telemetry & Interactive Dashboard
- Event-driven live metrics tracking: Total Requests, Success Rate %, Latency (ms), and Tokens
- Interactive Provider Grid — 1-click active provider switching directly from dashboard cards
- Real-time error traceback logging and stream reader lock safety guards

### ⚙️ Model Context Protocol (MCP) & Plan-Then-Act Agent
- Embedded MCP Server over JSON-RPC 2.0 (`tools/list`, `tools/call`, `resources/list`) exposing workspace resources and `[dev]` Transversal Domain SSOT data
- Direct File Attachments (`📎` button + Drag & Drop) with removable file pills
- Clipboard Screenshot Capture via `Ctrl + V` with Base64 preview & Multimodal AI Payload
- Interactive Large File Links with line navigation in active VS Code editor (`#L40`)
- Emoji Picker Popover (`😀`) & Markdown Shortcode Parser (`:rocket:`, `:bug:`, `:fire:`)
- Autonomous Agent Engine with Self-Correction Harness (auto-reflection on tool errors & diagnostics)
- Precise Substring Code Edit Tools (`ag_replaceInFile`, `ag_multiReplaceInFile`) avoiding full file rewrites
- Agent Stepper Widget rendering step-by-step plan execution (⏳ Pending, 🔄 In Progress, ✅ Completed, ❌ Failed)
- Ghost Text Inline Completion with FIM (Fill-In-the-Middle) prompting

---

## 🚀 Quick Start

### 1. Install the Extension

Install from Open VSX or load directly in VS Code / Antigravity IDE.

### 2. Configure a Provider

**For local inference:**
1. Install [Ollama](https://ollama.com)
2. Pull a model: `ollama pull qwen2.5-coder:14b`
3. The extension auto-detects Ollama on `localhost:11434`

**For cloud providers:**
1. Open Command Palette (`Ctrl+Shift+P`)
2. Run `AG AI: Set API Key for Provider` or place keys in `.env` (gitignored)
3. Select your provider via Status Bar or Dashboard

### 3. Start Chatting

Open the Chat panel and type `@ag` followed by your question, or use the 🤖 Activity Bar sidebar.

---

## 📖 Documentation

- Architecture & Design: `./docs/architecture.md`
- Provider Specification: `./docs/providers.md`

---

## 📄 License

MIT — See [LICENSE](./LICENSE)

---

**Versão:** 0.4.0 | **Última Revisão:** 2026-08-05 20:52:00

