# Antigravity Universal AI Provider (`ag-provider`)

<p align="center">
  <img src="https://img.shields.io/badge/Status-Production--Ready-brightgreen?style=for-the-badge&logo=github" alt="Status" />
  <img src="https://img.shields.io/badge/Protocol-ConnectRPC%2FProtobuf-purple?style=for-the-badge&logo=grpc" alt="Protocol" />
  <img src="https://img.shields.io/badge/API-OpenAI%20v1%20Compatible-orange?style=for-the-badge&logo=openai" alt="API" />
  <img src="https://img.shields.io/badge/Version-1.5.0-blue?style=for-the-badge" alt="Version" />
  <img src="https://img.shields.io/badge/License-MIT-green?style=for-the-badge" alt="License" />
</p>

<p align="center">
  <b>A lightweight, non-intrusive local compatibility proxy bridge for Antigravity IDE.</b><br />
  Connect any OpenAI-compatible AI backend (Kimi K3, Qwen 3.8 2.4T, Groq, Ollama, LM Studio, OpenRouter, DeepSeek, SiliconFlow) to Antigravity IDE with zero binary patching and complete security compliance.
</p>

> [!IMPORTANT]
> **CRITICAL ARCHITECTURE FACT**:
> The model selector dropdown **inside the Antigravity IDE UI** (e.g., *Gemini 3.6 Flash*) is **purely a visual frontend label**. Setting `CLOUD_CODE_ENDPOINT = "http://127.0.0.1:50051"` reroutes **100% of network traffic locally**. The **actual LLM engine** that responds to your prompts is chosen dynamically in the **Web Control Dashboard (`http://127.0.0.1:50051/dashboard`)**. Google servers receive ZERO requests, ZERO tokens are consumed from Google, and quota is NEVER affected!

---

## 🔑 How Antigravity IDE Routing & Google Login Work

### ❓ Why is Google Login required in Antigravity IDE?
Antigravity IDE requires a Google login **solely to unlock the UI chat drawer and assistant panel**. 

### 🔀 Traffic Rerouting
Setting `"antigravity.agentHostAddress": "http://127.0.0.1:50051"` or `$env:CLOUD_CODE_ENDPOINT = "http://127.0.0.1:50051"` redirects **100% of LLM inference traffic** to your local `ag-provider` proxy. Zero prompt traffic is sent to cloud servers.

### 🎯 Frontend Selector vs. Real LLM Engine
- The model menu **inside Antigravity IDE UI** (e.g. *Gemini 3.6 Flash*) acts as a visual frontend label.
- The **real LLM engine** that processes your prompts is chosen dynamically in the **Web Control Dashboard (`http://127.0.0.1:50051/dashboard`)**!

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

### 1. Installation & Build

```powershell
cd E:\00Dev\AntigravityUnlock\src\ag-provider
npm install
npm run build
```

### 2. Configure Secret Keys

Create `src/ag-provider/.env`:

```ini
KIMI_API_KEY=sk-seu-token-kimi
DASHSCOPE_API_KEY=sk-seu-token-dashscope
GROQ_API_KEY=gsk_seu-token-groq
OPENROUTER_API_KEY=sk-or-v1-seu-token-openrouter
```

### 3. Launch Proxy Server & Dashboard

```powershell
npm start
```

Open Dashboard: **`http://127.0.0.1:50051/dashboard`**

### 4. Launch Antigravity IDE

```powershell
$env:CLOUD_CODE_ENDPOINT = "http://127.0.0.1:50051"
$env:CODEIUM_CLOUD_CODE_ENDPOINT = "http://127.0.0.1:50051"
Start-Process "$env:LOCALAPPDATA\Programs\Antigravity IDE\Antigravity IDE.exe" -ArgumentList "--user-data-dir=`"E:\00Dev\AntigravityUnlock\.test-ide-profile`"","--new-window"
```

---

## 📖 Full Documentation

For detailed architecture analysis, ConnectRPC schemas, network diagrams, and troubleshooting guides, see [`docs/user_manual.md`](./docs/user_manual.md).

---

**Versão:** 1.5.0 | **Última Revisão:** 2026-07-27 00:00:00 -03:00
