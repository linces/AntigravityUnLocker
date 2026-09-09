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
- **Sidebar Webview (`src/ui/sidebar-webview.ts`)**: Interface webview reativa em TypeScript com card de chat estilo Qodo/Cursor, suporte a Thinking Blocks retráteis (`<details class="think-box">`), histórico de prompts navegável via `ArrowUp`/`ArrowDown`, seletor de Personas SynAI (`👑`, `📋`, `💻`, `🛡️`, `🔍`), suporte a anexos diretos, captura de imagens do clipboard (`Ctrl+V`) e seletor de modelos.
- **Native Chat (`src/chat/session-manager.ts`)**: Integrado à API nativa de chat do VS Code (`@ag`) com persistência de sessões no `workspaceState`.

### 4.2 Embedded AI Gateway Layer
- **Provider Manager (`src/providers/provider-manager.ts`)**: Gerencia conexões e estados com 12+ provedores (Ollama, LM Studio, OpenAI, Groq, NVIDIA NIM, OpenRouter, DashScope Qwen, Moonshot Kimi, DeepSeek, SiliconFlow, Together AI, Fireworks AI e Z.ai GLM-5.2). Suporta delimitação de `reasoning_content` no streaming para modelos de raciocínio.
- **Fallback Chain Engine**: Alternância automática de provedor em caso de timeout ou indisponibilidade da API principal.
- **Direct MCP Client Manager (`src/mcp/client.ts`)**: Suporte híbrido a servidores MCP via `stdio` e `sse` (Server-Sent Events) remoto com autenticação por headers.

### 4.3 Embedded SynAI Agent Harness & Swarm Delegation
- **Agent Engine (`src/agent/engine.ts`)**: Executa loops de raciocínio "Plan-Then-Act", decompondo instruções complexas e aplicando correções em tempo real com base no retorno de ferramentas.
- **Subagent Manager (`src/agent/subagent-manager.ts`)**: Motor de orquestração hierárquica para delegação de missões dedicadas (`ag_delegateTask`) ou concorrentes em paralelo (`ag_delegateParallelTasks`) para sub-agentes com contextos e históricos de mensagens isolados.
- **SynAI Multi-Persona Swarm (`src/agent/personas.ts`)**: Catálogo de 5 personas especializadas (Supervisor, Planner, Coder, Security, Reviewer) com políticas de prompt e escopo de ação dedicados.
- **Workspace Indexer (`src/agent/workspace-indexer.ts`)**: Varredura e sumarização estruturada de arquivos do projeto para contextualização semântica leve (`ag_workspaceDigest`).
- **Agent Planner (`src/agent/planner.ts`)**: Integração visual com o modo `🤖 Agent` na Webview, decompondo metas do usuário em planos estruturados (`### 📋 Execution Plan`) antes da execução de ferramentas.
- **Tool Registry (`src/tools/tool-registry.ts`)**: Coleção de ferramentas nativas de arquivos, terminal, workspace e edições substring de código (`ag_replaceInFile`, `ag_multiReplaceInFile`, `ag_workspaceDigest`, `ag_delegateTask`, `ag_delegateParallelTasks`).

### 4.4 Universal Domain & Rule Engine Layer
- **Domain Rules Manager (`src/domains/domain-rules-manager.ts`)**: Motor centralizado de auto-descoberta e injeção de diretrizes de projeto para todos os ecossistemas líderes:
  - `.agents/AGENTS.md`, `AGENTS.md`, `.agents/rules/*.md`, `.gemini/GEMINI.md`, `GEMINI.md` (Antigravity & Gemini).
  - `.cursorrules`, `.cursor/rules/*.md`, `.cursor/rules/*.mdc` com frontmatter YAML, globs e flags `alwaysApply` (Cursor).
  - `.windsurfrules`, `.windsurf/rules/*.md` (Windsurf / Codeium).
  - `.github/copilot-instructions.md` (GitHub Copilot).
  - `CLAUDE.md`, `.claude/rules/*.md` (Claude Code / Anthropic).
  - Repositório central transversal (`ag-universal-ai.domainRepositoryPath`).
- **Precedência Ponderada**: Ordenação determinística de instruções (`agents` (100) > `cursor` (90) > `windsurf` (80) > `copilot` (70) > `claude` (65) > `transversal-domain` (60)).
- **Matching Dinâmico de Globs**: Compilação de padrões de wildcard e subdiretórios (`**/*.tsx`, `src/api/**/*.ts`) avaliados dinamicamente contra o arquivo ativo no editor.
- **Ferramenta Nativa `ag_getWorkspaceRules`**: Inspeção estruturada e programática em JSON para agentes autônomos.

### 4.5 Human-in-the-Loop & Interactive Diff Preview Layer
- **Interactive Tool Approval (`src/agent/approval.ts`)**: Interrupção controlada do ciclo de execução do agente para validação humana de operações de escrita de disco (`ag_writeFile`, `ag_replaceInFile`, `ag_multiReplaceInFile`) e comandos de terminal (`ag_runCommand`).
- **In-Memory Diff Simulation**: Os módulos `EditTools` e `FileTools` geram versões virtuais propostas (`previewReplace`, `previewMultiReplace`, `previewWriteFile`) sem persistir alterações no disco antes da aprovação do usuário.
- **Side-by-Side Diff Inspector (`src/ui/diff-provider.ts`)**: Disparo de `vscode.diff` nativo através do esquema `ag-diff://` para comparação visual de código original vs. proposto (`🔍 Ver Diff`).
- **Webview Approval Bridge**: Interface de cards com botões `✅ Aprovar`, `⏭️ Pular` e opção de auto-aprovação persistente na sessão (`Sempre nesta sessão`), destravando o loop assíncrono do agente via IPC (`toolApprovalResponse`).
- **Adaptive LLM Reflection**: Injeção da justificativa de recusa como observação no diálogo para replanejamento dinâmico pelo modelo.

### 4.6 Runtime Model Auto-Discovery & Dynamic Capabilities Layer
- **Model Discovery Service (`src/providers/model-discovery.ts`)**: Consulta dinâmica de catálogos de modelos diretamente das APIs dos provedores em tempo real, eliminando listas estáticas obsoletas e erros 404 Model Not Found.
- **Hierarquia de Cache em 3 Níveis**:
  1. *L1 Memória (RAM)*: TTL de 30 minutos com invalidação programática.
  2. *L2 Persistência (`globalState`)*: Preserva listas conhecidas entre reinicializações do VS Code.
  3. *L3 Preset Estático Fallback*: Catálogo seguro embutido ativado apenas se a rede/API estiver offline.
- **Inflight Request Coalescing**: Deduplica requisições concorrentes de descoberta ao mesmo provedor em uma única promessa compartilhada.
- **Multi-Endpoint Adapter Fetching (`src/providers/openai-adapter.ts`)**: Varredura sequencial resiliente de endpoints comuns (`/models` e `/v1/models`).
- **Auto-Detecção de Capacidades**: Heurísticas semânticas para classificação automática de suporte a Function Calling (`looksLikeToolCapable`) e Visão Multimodal (`looksLikeVisionCapable`).
- **Higienização de Modelos Obsoletos (`OBSOLETE_MODEL_MIGRATIONS`)**: Migração automática e transparente de configurações herdadas com IDs descontinuados para substitutos válidos.
- **Transparência de Origem na UI**: Badges visuais e tooltips no QuickPick e Sidebar Webview identificando a procedência (`✓ Live`, `⚡ Cached`, `💾 Saved`, `📋 Preset`) e botão de disparo manual `🔄 Refresh Models`.

---

## 5. Diretrizes de Segurança & Telemetria

1. **Zero Exposure Policy**: Caminhos locais absolutos e nomes de usuários de ambiente não são expostos em logs, telemetria pública ou documentação.
2. **SecretStorage**: Armazenamento encriptado de chaves via VS Code Keyring.
3. **Métricas Locais**: A telemetria de requisições, latência e consumo de tokens é calculada e mantida localmente no cliente para exibição no Dashboard.

---

**Versão:** 0.12.0 | **Última Revisão:** 2026-09-09 07:49:00
