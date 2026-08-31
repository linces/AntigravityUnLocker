# AG Universal AI

<p align="center">
  <img src="https://img.shields.io/badge/Status-Active-brightgreen?style=for-the-badge&logo=github" alt="Status" />
  <img src="https://img.shields.io/badge/Platform-VS%20Code%20%7C%20Antigravity%20IDE-blue?style=for-the-badge&logo=visualstudiocode" alt="Platform" />
  <img src="https://img.shields.io/badge/Providers-12%2B-purple?style=for-the-badge&logo=openai" alt="Providers" />
  <img src="https://img.shields.io/badge/Version-0.6.4-green?style=for-the-badge" alt="Version" />
  <img src="https://img.shields.io/badge/License-MIT-brightgreen?style=for-the-badge" alt="License" />
</p>

<p align="center">
  <b>A powerful, multi-provider AI coding assistant & agent engine for VS Code & Antigravity IDE.</b><br />
  Code completion, multi-session chat, Direct MCP integration, embedded model routing, real-time telemetry, and tool calling.
</p>

> [!IMPORTANT]
> **AG Universal AI** operates as a unified Single Core engine inside VS Code / Antigravity IDE. It connects directly to official and open-source Model Context Protocol (MCP) servers (stdio JSON-RPC) and integrates an embedded multi-provider AI Gateway and multi-agent harness.

---

## 🏛️ Architecture & Core Vision (SSOT)

The platform consolidates AI capabilities directly into the VS Code extension host:

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                          AG Universal AI (VS Code / IDE)                    │
│                                                                             │
│  ┌─────────────────────────┐  ┌─────────────────────┐  ┌─────────────────┐ │
│  │   UI & Interaction      │  │  Embedded AI        │  │  Embedded       │ │
│  │   - Sidebar Webview     │  │  Gateway Layer      │  │  SynAI Agents   │ │
│  │   - Native Chat (@ag)   │  │  - Model Router     │  │  - Supervisor   │ │
│  │   - Ghost Text (FIM)    │  │  - Fallback Chain   │  │  - Planner      │ │
│  │   - Interactive Diff    │  │  - Token / Cost     │  │  - Code / Review│ │
│  └────────────┬────────────┘  └──────────┬──────────┘  └────────┬────────┘ │
│               │                          │                      │          │
│               └──────────────────────────┼──────────────────────┘          │
│                                          │                                 │
│                   ┌──────────────────────┴───────────────────┐             │
│                   │      Direct MCP Client Engine (stdio)    │             │
│                   │      (JSON-RPC 2.0 / Dynamic Tools)      │             │
│                   └──────────────────────┬───────────────────┘             │
└──────────────────────────────────────────┼─────────────────────────────────┘
                                           │
         ┌─────────────────────────────────┴────────────────────────────────┐
         │                                                                  │
         ▼                                                                  ▼
┌─────────────────────────────────────────┐    ┌──────────────────────────────────────────┐
│   MCPs Oficiais / Open-Source (Direto)  │    │     Provedores de IA Direct Client       │
│ ─────────────────────────────────────── │    │ ──────────────────────────────────────── │
│ • Filesystem & Git (Local Workspace)    │    │ • Ollama / LM Studio (Local)             │
│ • PostgreSQL / MySQL / SQLite (DB)      │    │ • OpenAI / Anthropic / Gemini (Cloud)    │
│ • Playwright (Browser Automation)       │    │ • Groq / DeepSeek / Qwen / GLM (Cloud)   │
│ • Docker / Kubernetes (Infra)           │    │ • OpenRouter / Together / Fireworks      │
│ • Fetch / Web Search (HTTP/REST)        │    └──────────────────────────────────────────┘
│ • Memory / Knowledge Graph (Context)    │
└─────────────────────────────────────────┘
```

---

## 🔌 12+ Supported AI Providers (2 Local + 10 Cloud)

| Provider | Type | Default Model | Key Features |
| :--- | :--- | :--- | :--- |
| **Ollama** | 🏠 Local | `qwen2.5-coder:14b` | 100% offline, free, auto-model discovery |
| **LM Studio** | 🏠 Local | `local-model` | GGUF models, free, offline |
| **OpenAI** | ☁️ Cloud | `gpt-4o` | GPT-4o, o1, o3-mini |
| **Groq** | ☁️ Cloud | `llama-3.3-70b-versatile` | Ultra-fast LPU inference |
| **OpenRouter** | ☁️ Cloud | `qwen/qwen-2.5-coder-32b-instruct` | Multi-model routing |
| **DashScope** | ☁️ Cloud | `qwen3.8-max-preview` | Qwen 3.8 (2.4T MoE), Qwen 2.5 Coder |
| **Moonshot AI** | ☁️ Cloud | `kimi-k3` | Kimi K3, 1M token context |
| **DeepSeek** | ☁️ Cloud | `deepseek-chat` | V3, R1 reasoning models |
| **SiliconFlow** | ☁️ Cloud | `Qwen/Qwen2.5-Coder-32B-Instruct` | High-speed open models |
| **Together AI** | ☁️ Cloud | `Qwen/Qwen2.5-Coder-32B-Instruct` | Open-source model hosting |
| **Fireworks AI** | ☁️ Cloud | `qwen2p5-coder-32b-instruct` | High-speed function calling |
| **Z.ai (GLM)** | ☁️ Cloud | `glm-5.2` | GLM-5.2 flagship open-source, 1M context |

---

## 📦 Matriz de MCPs Oficiais / Open-Source Recomendados

Para consumo direto pelo AG Universal AI sem necessidade de daemons intermediários:

| Categoria | MCP Server | Protocolo | Utilidade Principal |
| :--- | :--- | :--- | :--- |
| **Filesystem** | `@modelcontextprotocol/server-filesystem` | `stdio` | Acesso seguro e delimitado ao sistema de arquivos |
| **Git & Versionamento** | `@modelcontextprotocol/server-github` / `git-mcp` | `stdio` | Leitura de repositórios, commits, PRs e histórico Git |
| **Banco de Dados** | `@modelcontextprotocol/server-postgres` | `stdio` | Inspecionar schemas, executar queries e análises de DB |
| **Navegação & E2E** | `@modelcontextprotocol/server-playwright` | `stdio` | Automação de browser, screenshots e verificação visual |
| **Banco Leve / Cache** | `@modelcontextprotocol/server-sqlite` / `server-memory` | `stdio` | Memória de curto/longo prazo para sessões e grafos |
| **Requisições Web** | `@modelcontextprotocol/server-fetch` | `stdio` | Consumo de documentação web, REST APIs e scraping |
| **Containers & DevOps**| `docker-mcp` / `k8s-mcp` | `stdio` | Inspeção de containers, logs e comandos Docker |

---

## ✨ Features Principal

### 🤖 Multi-Provider Chat & Sessões Persistentes (`@ag` Sidebar)
- Persistência de sessões no `workspaceState` (criar `➕`, alternar `📜`, excluir `🗑️`, limpar `🧹`).
- Nomeação automática de sessões baseada na mensagem inicial.
- Qodo & Cursor Style Input Card com seletor de modelos/provedores em tempo real.
- Slash commands: `/explain`, `/refactor`, `/test`, `/fix`, `/docs`, `/review`.

### ⚡ Direct MCP Client Engine (`MCPClientManager`)
- Conexão nativa JSON-RPC 2.0 (`stdio`) a servidores MCP externos (Postgres, Git, Filesystem, Playwright).
- Descoberta automática de ferramentas e injeção dinâmica no `ToolRegistry`.
- Configuração simplificada via `.vscode/mcp.json` ou `ag-universal-ai.mcpServers`.

### 🔍 Visualização Interativa de Diff (`AGDiffProvider`)
- Pré-visualização side-by-side com `vscode.diff` e esquema virtual `ag-diff://` antes de aplicar modificações em arquivos.

### ⚡ Agent Engine & Multi-Agent Personas (SynAI Embedded)
- Motor autônomo com ciclos de planejamento, execução de ferramentas e reflexão com autocorreção.
- Edição de código por substituição precisa (`ag_replaceInFile`, `ag_multiReplaceInFile`).
- Suporte a personas especializadas (Supervisor, Planner, Code, Review, Security, Docs, Database).

### 📊 Telemetria & Dashboard Interativo
- Métricas em tempo real (requisições, taxa de sucesso %, latência ms e uso de tokens).
- Troca de provedor ativo com 1 clique diretamente no Dashboard (`AG AI: Show Dashboard`).

---

## 🚀 Quick Start

### 1. Configurar Provedor Local ou Cloud
- **Local (Ollama)**: Baixe [Ollama](https://ollama.com) e execute `ollama pull qwen2.5-coder:14b`.
- **Cloud**: Abra a Paleta de Comandos (`Ctrl+Shift+P`), execute `AG AI: Set API Key for Provider` ou configure o arquivo `.env` (gitignored).

### 2. Iniciar Chat & Usar Ferramentas
Abra a barra lateral de IA e digite `@ag` ou interaja diretamente pelo painel interativo.

---

## 📖 Documentation

- Architecture Blueprint (SSOT): `./docs/architecture.md`
- Provider Specification: `./docs/providers.md`
- Troubleshooting & Incident Resolution: `./docs/troubleshooting.md`

---

## 📄 License

---

**Versão:** 0.6.4 | **Última Revisão:** 2026-08-31 09:19:00


