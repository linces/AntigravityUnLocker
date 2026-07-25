---
domain: dev
category: user_guide
type: documentation
created: 2026-07-25
last_updated: 2026-07-25T12:12:00-03:00
version: 1.4.0
---

# Operation & Usage Manual - Antigravity Universal AI Provider (`ag-provider`)

## Table of Contents

1. [Overview & Topology](#1-overview--topology)
2. [Prerequisites](#2-prerequisites)
3. [Installation & Build](#3-installation--build)
4. [Configuration (`providers.json`)](#4-configuration-providersjson)
5. [Environment Variables Setup](#5-environment-variables-setup)
6. [Launching the Proxy Server](#6-launching-the-proxy-server)
7. [IDE Configuration](#7-ide-configuration)
8. [Using the Web Control Dashboard](#8-using-the-web-control-dashboard)
9. [Supported Models & Capabilities](#9-supported-models--capabilities)
10. [Troubleshooting & Diagnostics](#10-troubleshooting--diagnostics)

---

## 1. Overview & Topology

`ag-provider` acts as a transparent, high-performance local proxy bridge between **Antigravity IDE** and any **OpenAI-compatible LLM inference server**.

```
+-------------------+           ConnectRPC Stream          +-------------------+
|  Antigravity IDE  |  --------------------------------->  |    ag-provider    |
|   (Electron Host) |   http://127.0.0.1:50051             |   (Local Proxy)   |
+-------------------+                                      +-------------------+
                                                                     |
                                                                     | OpenAI REST / SSE
                                                                     v
                                                           +-------------------+
                                                           | Target AI Engine  |
                                                           | (Kimi K3 / Qwen / |
                                                           | Ollama / Cloud)   |
                                                           +-------------------+
```

---

## 2. Prerequisites

Before starting, ensure your operating environment has:

- **Node.js**: `v18.0.0` or higher (`v22+` recommended).
- **npm**: `v9.0.0` or higher.
- **Antigravity IDE**: Installed on system.
- **API Key or Local LLM Runner**:
  - API Keys for Cloud providers (**Kimi K3**, **SiliconFlow**, **DashScope**, **OpenRouter**, **DeepSeek**).
  - Or local runners (**Ollama** listening on `http://localhost:11434` or **LM Studio** listening on `http://localhost:1234`).

---

## 3. Installation & Build

1. Navigate to the bridge directory:
   ```bash
   cd src/ag-provider
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Compile TypeScript codebase:
   ```bash
   npm run build
   ```

---

## 4. Configuration (`providers.json`)

The provider catalog and routing rules are managed inside `src/ag-provider/providers.json`.

### Sample Configuration

```json
{
  "default": "kimi-k3",
  "fallback": ["qwen-3.8-max", "ollama-local"],
  "providers": [
    {
      "id": "kimi-k3",
      "name": "Kimi K3 (Moonshot AI - 1M Context)",
      "baseUrl": "https://api.moonshot.ai/v1",
      "apiKey": "${KIMI_API_KEY}",
      "model": "kimi-k3",
      "timeoutMs": 120000
    },
    {
      "id": "qwen-3.8-max",
      "name": "Qwen 3.8 (2.4T MoE - DashScope)",
      "baseUrl": "https://dashscope.aliyuncs.com/compatible-mode/v1",
      "apiKey": "${DASHSCOPE_API_KEY}",
      "model": "qwen3.8-max-preview",
      "timeoutMs": 120000
    },
    {
      "id": "qwen-siliconflow",
      "name": "Qwen 2.5 Coder 32B (SiliconFlow)",
      "baseUrl": "https://api.siliconflow.cn/v1",
      "apiKey": "${SILICONFLOW_API_KEY}",
      "model": "Qwen/Qwen2.5-Coder-32B-Instruct",
      "timeoutMs": 60000
    },
    {
      "id": "ollama-local",
      "name": "Ollama Local (qwen2.5-coder)",
      "baseUrl": "http://localhost:11434/v1",
      "apiKey": "ollama",
      "model": "qwen2.5-coder:14b",
      "timeoutMs": 120000
    }
  ]
}
```

---

## 5. Environment Variables Setup

Set the API keys for the services configured in `providers.json` before launching:

### On Windows PowerShell:
```powershell
$env:KIMI_API_KEY="your-kimi-api-key"
$env:DASHSCOPE_API_KEY="your-dashscope-api-key"
$env:SILICONFLOW_API_KEY="your-siliconflow-api-key"
$env:OPENROUTER_API_KEY="your-openrouter-api-key"
```

### On Linux / macOS / Bash:
```bash
export KIMI_API_KEY="your-kimi-api-key"
export DASHSCOPE_API_KEY="your-dashscope-api-key"
export SILICONFLOW_API_KEY="your-siliconflow-api-key"
export OPENROUTER_API_KEY="your-openrouter-api-key"
```

---

## 6. Launching the Proxy Server

To start `ag-provider` in production mode:

```bash
cd src/ag-provider
npm start
```

Or in development mode with auto-reload:

```bash
npm run dev
```

Upon successful startup, the console displays:

```
=======================================================
  Antigravity Universal AI Provider Bridge (ag-provider) 
  Control Panel: http://127.0.0.1:50051/dashboard
  Running on http://127.0.0.1:50051
=======================================================
```

---

## 7. IDE Configuration

To route Antigravity IDE traffic through `ag-provider`:

1. Open **Antigravity IDE**.
2. Open Settings (`Ctrl+,` or `Cmd+,`).
3. Search for or edit `settings.json` directly.
4. Add the host address override:
   ```json
   "antigravity.agentHostAddress": "http://127.0.0.1:50051"
   ```
5. Reload IDE window or restart current conversation.

---

## 8. Using the Web Control Dashboard

Access `http://127.0.0.1:50051/dashboard` in any browser to open the dark-mode control panel:

- **Active Provider**: View the currently active inference backend.
- **Dynamic Provider Switching**: Change the active model on-the-fly without restarting the bridge.
- **Connection Test**: Perform real-time health checks and latency measurements.
- **Resource Monitoring**: Track Node.js heap memory consumption and service uptime.

---

## 9. Supported Models & Capabilities

| Model / Provider | Context Window | Vision | Tool Calling | Primary Use Case |
| :--- | :--- | :--- | :--- | :--- |
| **Kimi K3 (Moonshot)** | **1,048,576 Tokens** | ✅ | ✅ | Large codebase reasoning & refactoring |
| **Qwen 3.8 (DashScope)** | **128,000 Tokens** | ✅ | ✅ | Flagship 2.4T MoE code generation |
| **Qwen 2.5 Coder 32B** | 32,768 Tokens | ✅ | ✅ | High speed code completions |
| **Ollama Local** | Device Dependent | ✅ | ✅ | Offline, zero-latency local execution |

---

## 10. Troubleshooting & Diagnostics

### Issue: Health Check returns 500 / Timeout
- **Cause**: Target model API key is missing or endpoint is down.
- **Fix**: Verify environment variables (`export KIMI_API_KEY=...`) or ensure Ollama is running.

### Issue: IDE Chat hangs
- **Cause**: Incorrect port or `agentHostAddress` setting mismatch.
- **Fix**: Confirm `ag-provider` is running on `http://127.0.0.1:50051` by testing `GET http://127.0.0.1:50051/health` in your browser.

---

**Versão:** 1.4.0 | **Última Revisão:** 2026-07-25 12:12:00 -03:00
