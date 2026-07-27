# Antigravity Universal AI Provider (`ag-provider`)

<p align="center">
  <img src="https://img.shields.io/badge/Status-Production--Ready-brightgreen?style=for-the-badge&logo=github" alt="Status" />
  <img src="https://img.shields.io/badge/Protocol-ConnectRPC%2FProtobuf-purple?style=for-the-badge&logo=grpc" alt="Protocol" />
  <img src="https://img.shields.io/badge/API-OpenAI%20v1%20Compatible-orange?style=for-the-badge&logo=openai" alt="API" />
  <img src="https://img.shields.io/badge/Version-1.6.0-blue?style=for-the-badge" alt="Version" />
  <img src="https://img.shields.io/badge/License-MIT-green?style=for-the-badge" alt="License" />
</p>

<p align="center">
  <b>A lightweight, non-intrusive local compatibility proxy bridge for Antigravity IDE.</b><br />
  Connect any OpenAI-compatible AI backend (Kimi K3, Qwen 3.8 2.4T, Groq, Ollama, LM Studio, OpenRouter, DeepSeek, SiliconFlow) to Antigravity IDE with zero binary patching and complete security compliance.
</p>

> [!IMPORTANT]
> **CRITICAL ARCHITECTURE FACTS (DUAL-MODE OPERATIONAL DESIGN)**:
> 1. **Proxy Mode vs. Native Official Gemini Mode**:
>    - **Universal Proxy Mode (`ag-provider`)**: Launch the IDE via PowerShell with `$env:CLOUD_CODE_ENDPOINT = "http://127.0.0.1:50051"`. 100% of LLM traffic is rerouted locally to `ag-provider` on port `50051`. Active backend is chosen in the **Web Control Dashboard (`http://127.0.0.1:50051/dashboard`)**. Google receives 0 bytes and quota is NEVER touched!
>    - **Official Gemini Mode**: Launch the IDE normally from your Windows Desktop / Start Menu shortcut (without terminal env vars). The IDE communicates directly with official Google Cloud AI servers.
> 2. **IDE Frontend Selector Label**:
>    - In Proxy Mode, the model dropdown inside Antigravity IDE UI (e.g. *Gemini 3.6 Flash*) is **purely a visual frontend label**. The actual engine responding to your prompts is controlled dynamically in the Web Dashboard!

---

## 🔑 How Antigravity IDE Routing & Google Login Work

### ❓ Why is Google Login required in Antigravity IDE?
Antigravity IDE requires a Google login **solely to unlock the UI chat drawer and assistant panel**. 

### 🔀 Traffic Rerouting
Setting `"jetski.cloudCodeUrl": "http://127.0.0.1:50051"` and `"antigravity.agentHostAddress": "http://127.0.0.1:50051"` in `settings.json` (or launching via `scripts/open-proxied-ide.bat`) redirects **100% of LLM inference traffic** to your local `ag-provider` proxy. Zero prompt traffic is sent to cloud servers.

### 🎯 Frontend Selector vs. Real LLM Engine
- The model menu **inside Antigravity IDE UI** (e.g. *Gemini 3.6 Flash*) acts as a visual frontend label.
- The **real LLM engine** that processes your prompts is chosen dynamically in the **Web Control Dashboard (`http://127.0.0.1:50051/dashboard`)**!

---

## ⚠️ Language Server Bootstrap (v1internal Routes)

The Antigravity IDE Language Server (`language_server_windows_x64.exe`) requires a set of **Google Cloud Code internal API endpoints** to initialize its model catalog before it can accept any inference requests.

`ag-provider` now includes a full simulation of these endpoints:

| Endpoint | Method | Purpose |
| :--- | :--- | :--- |
| `/v1internal:loadCodeAssist` | POST | Bootstrap: user tier, model catalog, project ID |
| `/v1internal:listExperiments` | POST | Feature flags (returns empty — no experiments needed) |
| `/v1internal/cascadeNuxes` | GET | Onboarding prompts (returns empty list) |
| `/v1internal:fetchAvailableModels` | POST | Model list for LS model resolver |
| `/v1internal:fetchUserInfo` | POST | User account settings |
| `/v1internal:fetchAdminControls` | POST | Enterprise/admin controls |

Without these routes the LS enters an infinite retry loop and all chat/agent features fail with `unknown model key MODEL_PLACEHOLDER_M71: model not found`.

---

## 🔒 Security & Credential Isolation (`.env`)

> [!IMPORTANT]
> **API keys are NEVER hardcoded into Git-tracked repository files.**

- **Secret Keys (`src/ag-provider/.env`)**: API keys are stored locally in `.env` and strictly ignored by `.gitignore`.
- **Public Definitions (`src/ag-provider/providers.json`)**: Tracks provider endpoints using `${VAR_NAME}` placeholders.

---

## 🌐 Supported Providers & Key Procurement Links

| Provider / Engine | Primary Model | Official Key Procurement Link | Features |
| :--- | :--- | :--- | :--- |
| **Kimi K3 (Moonshot)** | `kimi-k3` | 🔗 [platform.moonshot.cn/console/api-keys](https://platform.moonshot.cn/console/api-keys) | **1M Token Context**, Deep Reasoning |
| **Alibaba DashScope** | `qwen3.8-max-preview` / `qwen2.5-coder` | 🔗 [dashscope.console.aliyun.com/apiKey](https://dashscope.console.aliyun.com/apiKey) | Flagship 2.4T MoE & Code Models |
| **Groq** | `llama-3.3-70b-versatile` | 🔗 [console.groq.com/keys](https://console.groq.com/keys) | ⚡ **Ultra-Fast Free Tier** (~400 tok/s) |
| **OpenRouter** | `qwen/qwen-2.5-coder-32b-instruct` | 🔗 [openrouter.ai/settings/keys](https://openrouter.ai/settings/keys) | 🟢 **100% Free Models Available** |
| **SiliconFlow** | `Qwen/Qwen2.5-Coder-32B-Instruct` | 🔗 [cloud.siliconflow.cn/account/ak](https://cloud.siliconflow.cn/account/ak) | Free Sign-up Credits |
| **Ollama (Local)** | `qwen2.5-coder` | 🔗 [ollama.com](https://ollama.com) | 🏠 **100% Offline & Free** |
| **LM Studio (Local)** | GGUF Local Models | 🔗 [lmstudio.ai](https://lmstudio.ai) | 🏠 **100% Offline & Free** |

---

## 🛠️ Quick Start Guide

### ⚡ One-Click Launch (Recommended)

Double-click **`START.bat`** at the project root. It will automatically:

1. 🔴 Kill any existing proxy on port `50051`
2. 🟢 Build (if needed) and start `ag-provider` in the background
3. 🌐 Open the Web Dashboard at **`http://127.0.0.1:50051/dashboard`**
4. 🖥️ Launch Antigravity IDE with proxy settings pre-configured

Logs are saved to `ag-provider.log` at the project root.

---

### Manual Setup

#### 1. Installation & Build

```powershell
cd ./src/ag-provider
npm install
npm run build
```

#### 2. Configure Secret Keys

Create `src/ag-provider/.env`:

```ini
KIMI_API_KEY=sk-seu-token-kimi
DASHSCOPE_API_KEY=sk-seu-token-dashscope
GROQ_API_KEY=gsk_seu-token-groq
OPENROUTER_API_KEY=sk-or-v1-seu-token-openrouter
```

#### 3. Individual Scripts (in `scripts/`)

| Script | Purpose |
| :--- | :--- |
| `scripts/start-bridge.bat` | Start proxy only |
| `scripts/open-proxied-ide.bat` | Open IDE with proxy config |
| `scripts/start-diag-proxy.bat` | Start diagnostic capture proxy |
| `scripts/cleanup.bat` | Remove test profile & captures |

---

## 📖 Full Documentation

For detailed architecture analysis, ConnectRPC schemas, network diagrams, and troubleshooting guides, see [`docs/user_manual.md`](./docs/user_manual.md).

---

**Versão:** 1.6.0 | **Última Revisão:** 2026-07-27 01:47:00
