# Software Architecture Blueprint — AG Universal AI (SSOT)

## 1. Visão Geral & Princípios

O **AG Universal AI** é uma plataforma unificada e assistente de inteligência artificial de alta performance operando diretamente como uma extensão nativa no **VS Code** e **Antigravity IDE**.

### Princípios Arquiteturais (`[dev]`)
* **Single Core Engine**: A extensão concentra a orquestração e execução local, abstraindo microsserviços e daemons externos.
* **Direct MCP Strategy**: Comunicação direta via JSON-RPC 2.0 (`stdio` / `SSE`) com servidores MCP locais e remotos.
* **Embedded AI Gateway**: Roteamento multi-provedor (12+ provedores local/cloud), controle de tokens, failover e rate limiting nativos no cliente.
* **Embedded SynAI Agents**: Motor autônomo de agentes com personas especializadas (Supervisor, Planner, Code, Review, Security, Database).
* **Security & Zero Trust**: Chaves mantidas em `SecretStorage` do VS Code ou bootstrap via `.env` local (gitignored). Zero vazamento de PII ou caminhos absolutos locais.

---

## 2. Diagrama Arquitetural Geral

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                          AG Universal AI (VS Code / IDE)                    │
│                                                                             │
│  ┌─────────────────────────┐  ┌─────────────────────┐  ┌─────────────────┐ │
│  │   UI & Interaction      │  │  Embedded AI        │  │  Embedded       │ │
│  │   - Sidebar Webview     │  │  Gateway Layer      │  │  SynAI Agents   │ │
│  │   - Native Chat (@ag)   │  │  - Model Router     │  │  - Supervisor   │ │
│  │   - Ghost Text (FIM)    │  │  - Fallback Chain   │  │  - Planner      │ │
│  │   - QuickPick / Status  │  │  - Token / Cost     │  │  - Code / Review│ │
│  └────────────┬────────────┘  └──────────┬──────────┘  └────────┬────────┘ │
│               │                          │                      │          │
│               └──────────────────────────┼──────────────────────┘          │
│                                          │                                 │
│                   ┌──────────────────────┴───────────────────┐             │
│                   │      Embedded Direct MCP Client Engine   │             │
│                   │      (JSON-RPC 2.0 / stdio / SSE)        │             │
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

## 3. Matriz de MCPs Oficiais / Open-Source Integração Direta

O AG Universal AI consome os principais servidores MCP da comunidade via `stdio`:

| Categoria | MCP Server | Protocolo | Utilidade Principal |
| :--- | :--- | :--- | :--- |
| **Filesystem** | `@modelcontextprotocol/server-filesystem` | `stdio` | Acesso seguro e delimitado ao workspace local |
| **Git & Versionamento** | `@modelcontextprotocol/server-github` / `git-mcp` | `stdio` | Leitura de repositórios, commits, PRs e histórico Git |
| **Banco de Dados** | `@modelcontextprotocol/server-postgres` | `stdio` | Inspeção de schemas, queries controladas e análises de DB |
| **Navegação & E2E** | `@modelcontextprotocol/server-playwright` | `stdio` | Automação de browser, screenshots e verificação visual |
| **Banco Leve / Cache** | `@modelcontextprotocol/server-sqlite` / `server-memory` | `stdio` | Memória de curto/longo prazo para sessões e grafos |
| **Requisições Web** | `@modelcontextprotocol/server-fetch` | `stdio` | Consumo de documentação web, REST APIs e scraping |
| **Containers & DevOps**| `docker-mcp` / `k8s-mcp` | `stdio` | Inspeção de containers, logs e comandos Docker |

---

## 4. Componentes Internos da Extensão

### 4.1 UI & Workspace Integration Layer
- **Sidebar Webview (`src/ui/sidebar-webview.ts`)**: Interface webview reativa em TypeScript com card de chat estilo Qodo/Cursor, suporte a anexos diretos, captura de imagens do clipboard (`Ctrl+V`) e seletor de modelos.
- **Native Chat (`src/chat/session-manager.ts`)**: Integrado à API nativa de chat do VS Code (`@ag`) com persistência de sessões no `workspaceState`.

### 4.2 Embedded AI Gateway Layer
- **Provider Manager (`src/providers/provider-manager.ts`)**: Gerencia conexões e estados com 12+ provedores (Ollama, LM Studio, OpenAI, Groq, NVIDIA NIM, OpenRouter, DashScope Qwen, Moonshot Kimi, DeepSeek, SiliconFlow, Together AI, Fireworks AI e Z.ai GLM-5.2).
- **Fallback Chain Engine**: Alternância automática de provedor em caso de timeout ou indisponibilidade da API principal.

### 4.3 Embedded SynAI Agent Harness
- **Agent Engine (`src/agent/engine.ts`)**: Executa loops de raciocínio "Plan-Then-Act", decompondo instruções complexas e aplicando correções em tempo real com base no retorno de ferramentas.
- **Tool Registry (`src/tools/tool-registry.ts`)**: Coleção de ferramentas nativas de arquivos, terminal, workspace e edições substring de código (`ag_replaceInFile`, `ag_multiReplaceInFile`).

---

## 5. Diretrizes de Segurança & Telemetria

1. **Zero Exposure Policy**: Caminhos locais absolutos e nomes de usuários de ambiente não são expostos em logs, telemetria pública ou documentação.
2. **SecretStorage**: Armazenamento encriptado de chaves via VS Code Keyring.
3. **Métricas Locais**: A telemetria de requisições, latência e consumo de tokens é calculada e mantida localmente no cliente para exibição no Dashboard.

---

**Versão:** 0.6.1 | **Última Revisão:** 2026-08-30 18:22:00
