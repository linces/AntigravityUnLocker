# AG Universal AI

<p align="center">
  <img src="https://img.shields.io/badge/Status-Active-brightgreen?style=for-the-badge&logo=github" alt="Status" />
  <img src="https://img.shields.io/badge/Platform-VS%20Code%20%7C%20Antigravity%20IDE-blue?style=for-the-badge&logo=visualstudiocode" alt="Platform" />
  <img src="https://img.shields.io/badge/Providers-13-purple?style=for-the-badge&logo=openai" alt="Providers" />
  <img src="https://img.shields.io/badge/Tests-84%20passing-brightgreen?style=for-the-badge&logo=mocha" alt="Tests" />
  <img src="https://img.shields.io/badge/Version-0.13.1-green?style=for-the-badge" alt="Version" />
  <img src="https://img.shields.io/badge/License-MIT-brightgreen?style=for-the-badge&logo=opensourceinitiative" alt="License" />
</p>

<p align="center">
  <b>A powerful, multi-provider AI coding assistant & agent engine for VS Code & Antigravity IDE.</b><br />
  Workspace Checkpointing & Time-Travel Rollback, Runtime Model Auto-Discovery, Parallel Subagents & Swarm Delegation, Human-in-the-Loop Diff Approval, Universal Rules, and Direct MCP.
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

## 🔌 13 Supported AI Providers (2 Local + 11 Cloud)

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
| **NVIDIA NIM** | ☁️ Cloud | `meta/llama-3.3-70b-instruct` | Llama 3.3 70B, Nemotron, DeepSeek R1 |
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
- **Reasoner UX & Thinking Blocks**: Renderização dinâmica de blocos de raciocínio expansíveis/retráteis (`<details class="think-box">`) para modelos como DeepSeek R1 e Kimi K1.5.
- **Histórico de Prompts no Terminal-Style**: Navegação de histórico de comandos e prompts no `<textarea>` com `ArrowUp` e `ArrowDown`.
- Nomeação automática de sessões baseada na mensagem inicial.
- Qodo & Cursor Style Input Card com seletor de modelos/provedores em tempo real.
- Slash commands: `/explain`, `/refactor`, `/test`, `/fix`, `/docs`, `/review`.

### ⚡ Direct MCP Client Engine (`MCPClientManager`)
- Conexão nativa JSON-RPC 2.0 (`stdio` e `sse` remoto) a servidores MCP locais e em nuvem (Postgres, Git, Filesystem, Playwright).
- Suporte a cabeçalhos de autenticação customizados (`headers`) para MCPs remotos.
- Descoberta automática de ferramentas e injeção dinâmica no `ToolRegistry`.
- Configuração simplificada via `.vscode/mcp.json` ou `ag-universal-ai.mcpServers`.

### 🔍 Visualização Interativa de Diff (`AGDiffProvider`)
- Pré-visualização side-by-side com `vscode.diff` e esquema virtual `ag-diff://` antes de aplicar modificações em arquivos.

### ⚡ Agent Engine & SynAI Multi-Persona Swarm
- **5 Personas Especializadas**:
  - 👑 **Supervisor**: Orquestração executiva, síntese e coordenação de metas.
  - 📋 **Planner**: Decomposição em passos estruturados (`### 📋 Execution Plan`) e arquitetura.
  - 💻 **Coder**: Implementação cirúrgica com `ag_replaceInFile` e `ag_multiReplaceInFile`.
  - 🛡️ **Security**: Auditoria de segurança Zero Trust, contenção de path traversal e proteção contra vazamento de PII.
  - 🔍 **Reviewer**: Validação de qualidade, prevenção de regressões e testes unitários.
- **Seletor de Personas na UI**: Alternância com 1 clique no Input Card ou chips rápidos (`👑 @supervisor`, `💻 @coder`, `🛡️ @security`).
- **Workspace Context Indexer (`ag_workspaceDigest`)**: Mapeamento inteligente da topologia do workspace excluindo ruído (`node_modules`, `.git`, `.vsix`).

### 📜 Universal Domain & Rule Engine (`DomainRulesManager`)
- **Descoberta Multi-Ecossistema Transparente**: Auto-detecção de diretrizes e regras nos padrões:
  - 🤖 **Antigravity / Gemini**: `.agents/AGENTS.md`, `AGENTS.md`, `.agents/rules/*.md`, `.gemini/GEMINI.md`, `GEMINI.md`.
  - ⚡ **Cursor**: `.cursorrules`, `.cursor/rules/*.md`, `.cursor/rules/*.mdc` (com parsing de frontmatter YAML, `description`, `globs` e `alwaysApply`).
  - 🏄 **Windsurf / Codeium**: `.windsurfrules`, `.windsurf/rules/*.md`.
  - 🐙 **GitHub Copilot**: `.github/copilot-instructions.md`.
  - 🧠 **Claude Code**: `CLAUDE.md`, `.claude/rules/*.md`.
  - 🌐 **Domínios Transversais**: Repositório central com scripts DEE (`ag-universal-ai.domainRepositoryPath`).
- **Injeção de Contexto & Precedência Ponderada**: Regras agregadas são injetadas automaticamente no System Prompt (`@ag`, Sidebar e `AgentEngine`) respeitando pesos de precedência (`agents` > `cursor` > `windsurf` > `copilot` > `claude` > `transversal-domain`).
- **Filtro Dinâmico por Globs**: Regras de tecnologia específicas (`*.ts`, `src/api/**/*.ts`, `**/*.tsx`) são avaliadas contra o arquivo aberto no editor ativo em tempo real.
- **Ferramenta Nativa `ag_getWorkspaceRules`**: Inspeção estruturada e programática para agentes autônomos.
- **Comandos & Slash Command `/rules`**:
  - `/rules`: Exibe tabela das regras detectadas diretamente no Chat e Sidebar.
  - `AG AI: Show Workspace & Domain Rules`: Abre documento Markdown completo com todas as diretivas.
  - `AG AI: Reload Rules & Domains`: Recarrega as regras em tempo de execução.
- **Badge Dinâmico na Webview**: Indicador interativo `📜 X Rules` no cabeçalho com tooltip e chip rápido.

### 🛡️ Human-in-the-Loop & Visualizador de Diff Inline antes de salvar no disco (estilo Cline/Cursor)
- **Aprovação Interativa de Mutações**: Ferramentas de escrita e mutação (`ag_writeFile`, `ag_replaceInFile`, `ag_multiReplaceInFile`) e comandos de shell (`ag_runCommand`) solicitam aprovação humana explícita antes de qualquer alteração no disco.
- **Pré-visualização Lado a Lado (`🔍 Ver Diff`)**: Cálculo de diff virtual em memória sem tocar no disco (`previewReplace`, `previewMultiReplace`, `previewWriteFile`) e inspeção side-by-side via `AGDiffProvider`.
- **Ações Granulares na Sidebar**: Cards interativos com botões `✅ Aprovar`, `⏭️ Pular` e opção `Sempre nesta sessão` para auto-aprovação contínua.
- **Feedback Adaptativo para o LLM**: Quando uma ação é pulada ou recusada, o motivo é injetado como observação no loop do agente para que o modelo formule planos ou abordagens alternativas.
- **Políticas de Aprovação Configuráveis**: Opções `interactive` (padrão), `auto-edit` ou `always` via configuração `ag-universal-ai.agent.approvalPolicy`.
- **Execução Automática de Somente Leitura**: Ferramentas de leitura (`ag_readFile`, `ag_listFiles`, `ag_searchWorkspace`, `ag_workspaceDigest`, `ag_getWorkspaceRules`, etc.) são executadas automaticamente sem interrupção.

### 🤖 Sub-agentes Paralelos & Delegação de Tarefas no Swarm (`SubagentManager`)
- **Delegação Hierárquica Especializada**: O agente orquestrador (Supervisor / Planner) pode delegar missões dedicadas para sub-agentes com personas isoladas (`coder`, `security`, `reviewer`, `planner`) via `ag_delegateTask`.
- **Execução Concorrente em Paralelo (`ag_delegateParallelTasks`)**: Permite rodar múltiplas tarefas simultaneamente via `Promise.allSettled`, executando por exemplo auditoria de segurança (`security`) em paralelo com revisão de testes unitários (`reviewer`).
- **Isolamento Total de Contexto**: Cada sub-agente instancia seu próprio histórico de diálogo e ferramentas sem poluir o histórico principal do orquestrador.
- **Herança de Aprovação Human-in-the-Loop**: Sub-agentes herdam as mesmas políticas de segurança (`approvalPolicy`), exigindo confirmação com diff antes de gravar arquivos.
- **Prevenção de Recursão Infinita**: Bloqueio rigoroso de profundidade configurável via `ag-universal-ai.agent.maxSubagentDepth` (padrão `2`).

### 🔍 Auto-Discovery de Modelos em Tempo Real (`ModelDiscoveryService`)
- **Consulta Dinâmica às APIs**: Varredura direta dos catálogos dos provedores via endpoints `/models` e `/v1/models`, eliminando o problema de modelos descontinuados ou 404 Model Not Found.
- **Hierarquia de Cache em 3 Níveis**:
  - *L1 Memória*: Cache RAM de 30 minutos com invalidação por refresh.
  - *L2 Persistência*: Salvo em `globalState` do VS Code para inicialização instantânea entre sessões.
  - *L3 Fallback Chain de 5 Camadas*: Live Query ➔ Inflight Coalescing ➔ Memory Cache ➔ Persistent Storage ➔ Preset Seguro.
- **Inflight Request Coalescing**: Requisições simultâneas para o mesmo provedor compartilham uma única promessa ativa, prevenindo excesso de tráfego.
- **Heurísticas Automáticas de Capacidades**: Detecção inteligente de suporte a chamadas de ferramentas (`🛠️ Tools`) e visão (`👁️ Vision`).
- **Higienização de Modelos Obsoletos**: Sanitização automática de modelos obsoletos herdados de configurações anteriores (como `nemotron-4-340b-instruct` e `llama-3.1-nemotron-70b-instruct` na NVIDIA NIM), migrando-os automaticamente para modelos atuais válidos (`meta/llama-3.3-70b-instruct`).
- **Transparência na UI**: Rótulos claros no QuickPick e Sidebar Webview identificando a origem (`✓ Live`, `⚡ Cached`, `💾 Saved`, `📋 Preset`) e botão de atualização manual (`🔄 Refresh Models`).

### ⏪ Workspace Checkpointing & Time-Travel Rollback (`CheckpointManager`)
- **Snapshots Copy-on-Write (CoW)**: Captura automática e instantânea do estado original de arquivos antes de qualquer mutação física pelo agente ou ferramentas (`ag_writeFile`, `ag_replaceInFile`, `ag_multiReplaceInFile`).
- **Reversão com 1 Clique (`⏪ Reverter Tarefa`)**: Restaura arquivos modificados para seu conteúdo exato pré-tarefa e remove arquivos temporários ou criados pelo agente.
- **Inspeção Visual de Mudanças (`🔍 Inspecionar Mudanças`)**: Integração com `ag-diff://` para comparar lado a lado o estado original do checkpoint contra as alterações atuais no disco.
- **Ferramentas Nativas para Agentes**: Suporte a `ag_createCheckpoint`, `ag_rollbackToCheckpoint` e `ag_listCheckpoints` permitindo auto-reversão e salvaguarda em execuções arriscadas.
- **Comandos no VS Code**: `AG AI: Create Workspace Checkpoint`, `AG AI: Revert Workspace to Checkpoint`, `AG AI: List Workspace Checkpoints`.

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

**Versão:** 0.13.1 | **Última Revisão:** 2026-09-09 08:58:00
