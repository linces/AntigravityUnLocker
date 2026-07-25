# Antigravity Universal AI Provider (`ag-provider`)

<p align="center">
  <img src="https://img.shields.io/badge/Status-Production--Ready-brightgreen?style=for-the-badge&logo=github" alt="Status" />
  <img src="https://img.shields.io/badge/Protocol-ConnectRPC%2FProtobuf-purple?style=for-the-badge&logo=grpc" alt="Protocol" />
  <img src="https://img.shields.io/badge/API-OpenAI%20v1%20Compatible-orange?style=for-the-badge&logo=openai" alt="API" />
  <img src="https://img.shields.io/badge/Version-1.4.0-blue?style=for-the-badge" alt="Version" />
  <img src="https://img.shields.io/badge/License-MIT-green?style=for-the-badge" alt="License" />
</p>

<p align="center">
  <b>A lightweight, non-intrusive local compatibility proxy bridge for Antigravity IDE.</b><br />
  Connect any OpenAI-compatible AI backend (Kimi K3, Qwen 3.8 2.4T, Ollama, LM Studio, OpenRouter, DeepSeek, vLLM, SiliconFlow, Groq, GLM) to Antigravity IDE with zero binary patching, zero authentication bypass, and full security compliance.
</p>

---

## 🌟 Key Features

- **⚡ Zero Binary Modification**: Operates 100% out-of-band via standard configuration extensions (`antigravity.agentHostAddress`).
- **📖 Comprehensive User & Operation Manual**: Detailed step-by-step setup and troubleshooting guide in [`docs/user_manual.md`](./docs/user_manual.md).
- **🔥 Flagship Model Support**: Built-in support for **Kimi K3** (1M Context reasoning) & **Qwen 3.8** (2.4 Trillion parameter MoE).
- **👁️ Multimodal / Vision Processing**: Translates ConnectRPC Protobuf `inlineData` Base64 images and diagrams into standard OpenAI `image_url` multimodal payloads.
- **🛠️ Function Calling & Tool Calling Translation**: Bidirectional translation between ConnectRPC Protobuf `functionDeclarations` and OpenAI `tools` / `tool_calls` schemas.
- **🔌 ConnectRPC / Protobuf Binary Pipeline**: Native 5-byte header envelope decoding/encoding (`application/connect+proto`) to standard OpenAI `v1/chat/completions` API formats.
- **🔄 Resilient Fallback & Load Balancing**: Automatic failover to secondary providers on rate limits, network timeouts, or HTTP 5xx errors.
- **🏠 Offline & Local-First Support**: First-class integration with Ollama, LM Studio, llama.cpp, and vLLM.
- **📊 Interactive Web Dashboard UI**: Real-time control panel at `http://127.0.0.1:50051/dashboard` for live model switching, latency, memory usage, and health checks.
- **🔒 Non-Destructive & Safe**: Preserves all native IDE licensing, authentication tokens, and workspace governance.

---

## 🏗️ System Architecture

```mermaid
flowchart TD
    subgraph Client["Antigravity IDE"]
        IDE["Electron Core Host<br/>(ConnectRPC / Protobuf)"]
    end

    subgraph Bridge["ag-provider Service (Local Proxy)"]
        RPC["ConnectRPC Ingress & Envelope Decoder<br/>http://127.0.0.1:50051"]
        TRANSLATOR["Protobuf / ConnectRPC <--> OpenAI Translator<br/>(Text, Vision Base64 & Tool Calls)"]
        ROUTER["Provider Router & Fallback Loop"]
        ADAPTER["OpenAI / Ollama Adapter"]
        DASHBOARD["Interactive Web Dashboard UI<br/>/dashboard"]
        RPC --> TRANSLATOR
        TRANSLATOR --> ROUTER
        ROUTER --> ADAPTER
        DASHBOARD --> ROUTER
    end

    subgraph Backends["Supported LLM Ecosystem"]
        KIMI["Kimi K3<br/>(1M Context Reasoning)"]
        QWEN38["Qwen 3.8 2.4T MoE<br/>(DashScope / Alibaba)"]
        OLLAMA["Local LLMs<br/>(Ollama / LM Studio / vLLM)"]
        CLOUD["Cloud Endpoints<br/>(OpenRouter / DeepSeek / SiliconFlow)"]
    end

    IDE -->|HTTP/2 ConnectRPC Stream| RPC
    ADAPTER -->|REST / SSE + Vision + Tools| KIMI
    ADAPTER -->|REST / SSE + Vision + Tools| QWEN38
    ADAPTER -->|REST / SSE + Vision + Tools| OLLAMA
    ADAPTER -->|REST / SSE + Vision + Tools| CLOUD
```

---

## 🌌 Supported Providers & Engines

| Provider / Engine | Type | Default Endpoint | Supported Features |
| :--- | :--- | :--- | :--- |
| **Kimi K3 (Moonshot AI)** | Cloud API | `https://api.moonshot.ai/v1` | **1M Token Context**, Always-on reasoning, Vision |
| **Qwen 3.8 (DashScope)** | Cloud / MoE | `https://dashscope.aliyuncs.com/compatible-mode/v1` | **2.4 Trillion Parameters**, Flagship MoE, Vision |
| **Ollama** | Local | `http://localhost:11434/v1` | Streaming, Local Code Models, Zero Cost |
| **LM Studio** | Local | `http://localhost:1234/v1` | GGUF Models, Offline Execution |
| **OpenRouter** | Cloud | `https://openrouter.ai/api/v1` | Multi-provider routing, Prompt Cache |
| **SiliconFlow** | Cloud | `https://api.siliconflow.cn/v1` | High-speed Qwen 2.5 Coder & DeepSeek V3/R1 |
| **DeepSeek** | Cloud | `https://api.deepseek.com/v1` | DeepSeek-V3, DeepSeek-R1 Reasoning |
| **vLLM / llama.cpp** | Self-Hosted | `http://localhost:8000/v1` | High-throughput batch inference |

---

## 📂 Repository Layout

```
.
├── README.md               # Master Project Documentation & Status
├── implementation_plan.md  # Architectural Implementation Plan
├── walkthrough.md          # Implementation Walkthrough & Deliverables Summary
├── todo.md                 # Project Task Matrix
├── roadmap.md              # Long-term Feature Roadmap
├── docs/                   # Engineering Specifications
│   ├── user_manual.md      # Comprehensive Operation & Usage Manual
│   ├── architecture.md     # Electron IDE runtime & ConnectRPC internals
│   ├── providers.md        # Provider catalog & ILLMProvider TypeScript interfaces
│   ├── network.md          # Protocol buffers, wire schemas & headers
│   ├── bridge.md           # ag-provider system topology & translation engine
│   └── findings.md         # Summary of reverse engineering discoveries
└── src/
    └── ag-provider/        # Bridge Service Codebase (Node.js / TypeScript)
        ├── package.json
        ├── tsconfig.json
        ├── providers.json  # Runtime configuration template
        └── src/
            ├── index.ts        # Main HTTP/2 Server & API routes
            ├── adapters/       # ILLMProvider implementations (OpenAI, Ollama)
            ├── router/         # Provider router & fallback manager
            ├── translation/    # ConnectRPC decoders, encoders, vision & tools
            └── dashboard/      # Web control panel UI (dashboardHtml.ts)
```

---

## 🛠️ Quick Start Guide

For full step-by-step instructions, view the [**Operation & Usage Manual**](./docs/user_manual.md).

### 1. Installation & Build

```bash
git clone https://github.com/your-username/antigravity-universal-provider.git
cd antigravity-universal-provider/src/ag-provider
npm install
npm run build
```

### 2. Launch Proxy

```bash
export KIMI_API_KEY="your-key"
npm start
```

### 3. Configure IDE

Add to `settings.json`:
```json
"antigravity.agentHostAddress": "http://127.0.0.1:50051"
```

---

## 📊 Health Check & Dashboard

- **Service Health Check**: `GET http://127.0.0.1:50051/health`
- **Interactive Control Panel**: `GET http://127.0.0.1:50051/dashboard`

---

## 🏷️ Tags

`dev` `ai` `reverse-engineering` `connectrpc` `openai-adapter` `ag-provider` `antigravity-ide` `ollama` `openrouter` `qwen` `deepseek` `kimi-k3` `tool-calling` `vision` `user-manual`

---

**Versão:** 1.4.0 | **Última Revisão:** 2026-07-25 12:12:00 -03:00
