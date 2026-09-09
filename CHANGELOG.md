# Changelog — AG Universal AI

All notable changes to the **AG Universal AI** extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.10.0] - 2026-09-09

### Added
- **Human-in-the-Loop Tool Approval (`src/agent/approval.ts`)**: Sistema de aprovação interativa para controle humano de mutações de disco e comandos de shell, alinhado à experiência de ferramentas como Cline e Cursor:
  - Interrupção segura do loop autônomo antes de executar ferramentas mutadoras (`ag_writeFile`, `ag_replaceInFile`, `ag_multiReplaceInFile`) ou comandos de terminal (`ag_runCommand`).
  - Execução automática sem bloqueio de ferramentas somente leitura (`ag_readFile`, `ag_listFiles`, `ag_searchWorkspace`, `ag_workspaceDigest`, `ag_getWorkspaceRules`).
  - Novas configurações no VS Code: `ag-universal-ai.agent.approvalPolicy` (`'interactive' | 'auto-edit' | 'always'`) e `ag-universal-ai.agent.alwaysApproveReadOnly` (`boolean`).
- **Pré-visualização de Diff em Memória (`EditTools.previewReplace`, `EditTools.previewMultiReplace`, `FileTools.previewWriteFile`)**:
  - Geração de diffs simulados em memória sem persistir alterações preliminares no disco.
  - Integração com `AGDiffProvider` para abertura instantânea do editor side-by-side (`vscode.diff`) pelo botão `🔍 Ver Diff`.
- **Interface de Aprovação na Webview (`AGSidebarWebviewProvider`)**:
  - Cards visuais dedicados (`.approval-card`) exibindo nome da ferramenta, resumo dos argumentos e arquivo alvo.
  - Ações diretas: `✅ Aprovar (Executar)`, `⏭️ Pular` e checkbox `Sempre nesta sessão` para habilitar auto-aprovação na sessão ativa.
  - Resolução assíncrona por promessa em IPC (`toolApprovalResponse`), destravando o engine sem recarregar o estado.
- **Feedback Adaptativo ao LLM em Recusas**:
  - Caso o usuário decline ou pule uma ferramenta, o modelo recebe mensagem explicativa como observação (`[Tool Skipped by User] Tool declined. Reason: ...`) para replanejar ou tentar abordagens alternativas.

### Tests
- Adicionada suíte de testes unitários `test/tool-approval.test.ts` cobrindo cálculo in-memory de diffs, validação de arquivos novos/existentes e ciclo completo de aprovação/pulo/auto-aprovação no `AgentEngine`, elevando a suíte para **47 testes automatizados 100% aprovados**.

---

## [0.9.0] - 2026-09-09

### Added
- **Universal Domain & Rule Engine (`src/domains/domain-rules-manager.ts`)**: Suporte unificado e transparente a regras de projeto em todos os ecossistemas líderes de IA:
  - 🤖 **Antigravity / Gemini**: `.agents/AGENTS.md`, `AGENTS.md`, `.agents/rules/*.md`, `.gemini/GEMINI.md`, `GEMINI.md`.
  - ⚡ **Cursor**: `.cursorrules`, `.cursor/rules/*.md`, `.cursor/rules/*.mdc` (com parsing de frontmatter YAML, `description`, `globs` e `alwaysApply`).
  - 🏄 **Windsurf / Codeium**: `.windsurfrules`, `.windsurf/rules/*.md`.
  - 🐙 **GitHub Copilot**: `.github/copilot-instructions.md`.
  - 🧠 **Claude Code**: `CLAUDE.md`, `.claude/rules/*.md`.
  - 🌐 **Domínios Transversais**: Repositório central com scripts DEE (`ag-universal-ai.domainRepositoryPath`).
- **Injeção de Contexto & Precedência Ponderada**: Regras agregadas são injetadas automaticamente no System Prompt do Chat (`@ag`), Sidebar Webview e `AgentEngine`, com ordenação de prioridade (`agents (100)` > `cursor (90)` > `windsurf (80)` > `copilot (70)` > `claude (65)` > `transversal-domain (60)`).
- **Matching Dinâmico de Globs em Tempo Real**: Avaliação dinâmica de padrões de arquivo (`*.ts`, `src/api/**/*.ts`, `**/*.tsx`) contra o documento ativo no editor, garantindo que regras específicas de tecnologia sejam aplicadas apenas quando relevante.
- **Ferramenta Nativa `ag_getWorkspaceRules`**: Inspeção estruturada e programática de diretivas de workspace para agentes autônomos e automações de engenharia.
- **Comandos & Slash Command `/rules`**:
  - `/rules` no Chat e Sidebar para exibir resumo tabular de regras ativas.
  - `AG AI: Show Workspace & Domain Rules` (`ag-universal-ai.showRules`): Visualização em documento Markdown detalhado.
  - `AG AI: Reload Rules & Domains` (`ag-universal-ai.reloadRules`): Recarga instantânea de regras sem reiniciar a janela.
- **Webview Rule Indicator & Badge**: Badge interativo no cabeçalho da Webview (`📜 X Rules`) com tooltip e chip rápido `📜 /rules`.

### Tests
- Adicionada suíte de testes unitários `test/domain-rules.test.ts` cobrindo descoberta multi-ecossistema, parsing MDC, globs em caminhos aninhados, precedência e ferramenta de regras, elevando a suíte para **40 testes automatizados 100% aprovados**.

---

## [0.8.0] - 2026-09-09

### Added
- **Remote MCP Transport (`transport: 'sse'`)**: Suporte a servidores MCP remotos via Server-Sent Events (SSE) e HTTP POST JSON-RPC 2.0 em `MCPClientManager`, permitindo conectar ferramentas MCP hospedadas em nuvem ou containers Docker remotos com cabeçalhos de autorização customizados (`headers`).
- **SynAI Multi-Persona Swarm Engine (`src/agent/personas.ts`)**: Implementação de 5 personas especializadas:
  - 👑 **Supervisor (`supervisor`)**: Orquestração executiva, decomposição de metas complexas e síntese de resultados.
  - 📋 **Architect & Planner (`planner`)**: Mapeamento de estrutura de arquivos, diagrama de dependências e planos por passos.
  - 💻 **Software Engineer (`coder`)**: Implementação de código pronto para produção, sem stubs e com edições cirúrgicas.
  - 🛡️ **Zero Trust Auditor (`security`)**: Validação de segurança, contenção de path traversal e prevenção de vazamento de credenciais e PII.
  - 🔍 **QA & Sentinel (`reviewer`)**: Análise de conformidade, integridade de testes unitários e prevenção de regressões.
- **Workspace Context Indexer & Tool (`ag_workspaceDigest`)**: Varredura inteligente da topologia do workspace excluindo pastas ruído (`node_modules`, `.git`, `dist`, `.vsix`), com agrupamento de arquivos por categorias (código fonte, configurações, documentação) para enriquecer o contexto do agente.
- **Persona Selector & Chips na Webview**: Seletor dropdown de Persona (`🎭 Persona`) no Input Card e chips rápidos (`👑 @supervisor`, `💻 @coder`, `🛡️ @security`) com sincronização automática e badge no stream do agente.

### Tests
- Adicionadas suítes de testes unitários `test/personas.test.ts`, `test/mcp-sse.test.ts` e `test/workspace-indexer.test.ts`, elevando a suíte para **36 testes automatizados 100% aprovados**.

---

## [0.7.0] - 2026-09-09

### Added
- **Reasoner UX & Thinking Blocks (`<details class="think-box">`)**: Native collapsible thinking blocks for reasoning models (DeepSeek R1, Kimi K1.5). Streaming parser in `OpenAIAdapter` automatically wraps `reasoning_content` in `<think>...</think>`, and the Sidebar Webview renders them dynamically into interactive collapsible details panels with dedicated styling and badge.
- **Prompt Navigation History**: Terminal-style input history in the sidebar chat textarea using `ArrowUp` (at start of input) and `ArrowDown`, preserving draft inputs and accelerating iterative prompt workflows.
- **Agent Planner Visual Integration**: Integrated `AgentPlanner` into `🤖 Agent` mode in `AGSidebarWebviewProvider`. Goals are structured into step-by-step execution plans (`### 📋 Execution Plan`) before tool execution starts, giving complete visibility over autonomous agent actions.

### Tests
- Added `test/reasoner-stream.test.ts` for reasoner stream demarcation testing, raising the test suite to 28 passing tests.

---

## [0.6.7] - 2026-09-09

### Added & Fixed
- **ESLint 9 Flat Configuration (`eslint.config.mjs`)**: Configured flat config for ESLint v9 integrated with `typescript-eslint`, eliminating the deprecated `--ext ts` invocation and restoring 100% green linter pass (`npm run lint`).
- **Path Traversal Security Hardening**: Enforced strict workspace root containment validation on `cwd` in `TerminalTools.runCommand` and on `filePath` in `WorkspaceTools.resolveUri`, blocking directory traversal attempts (`../../`).
- **Zero Exposure Policy Compliance**: Sanitized file references in `ChatParticipant.buildReferencesContext` by replacing raw system `fsPath` with `vscode.workspace.asRelativePath`, preventing local environment paths from leaking into LLM prompts.
- **Provider Registry & Manifest Alignment**: Added `nvidia` (NVIDIA NIM) to `package.json` under `ag-universal-ai.activeProvider` (`enum` and `enumDescriptions`).
- **Expanded Security Test Suite**: Added dedicated tests in `test/security-containment.test.ts` bringing the automated test suite to 26 passing tests.

---

## [0.6.6] - 2026-08-31

### Fixed
- **Template String Escape Immunization**: Immunized Webview template string generator using `String.fromCharCode(92)` and `String.fromCharCode(96)` to prevent compiler and bundler backslash de-escaping errors in client script.

---

## [0.6.3] - 2026-08-31

### Fixed
- **Webview Script Syntax Error Elimination**: Resolved fatal regular expression syntax error (`Invalid regular expression: /(file:/: Unterminated group`) in Webview template string compilation by replacing literal regex with safe escaped constructor `new RegExp(...)`. This restores complete initialization of `acquireVsCodeApi()`, `bindClick()`, event delegation, and all action buttons.

---

## [0.6.2] - 2026-08-31

### Fixed & Hardened
- **Webview Context Retention (`retainContextWhenHidden`)**: Registered `AGSidebarWebviewProvider` with `retainContextWhenHidden: true` to prevent VS Code from tearing down and discarding Webview DOM state, focus, and listeners during tab/editor switches.
- **Webview Script Resilience**: Moved core functions (`esc`, `md`, `addMsg`, `bot`) to top-level of IIFE to prevent `ReferenceError` during early errors. Added resilient message handler fallback in `done`, `chunk`, and `error` so messages are never silently dropped even if `streamEl` reference is reset.
- **Proactive Cloud API Key Guidance**: Added pre-request API key validation with clear in-chat guidance on saving keys via the `🔑` toolbar button or switching to free local providers (Ollama / LM Studio).
- **Interactive Code Block Diff**: Integrated `Diff 🔍` button directly in code block headers for one-click side-by-side inspection (`vscode.diff`).

---

## [0.6.1] - 2026-08-30

### Fixed
- **Extension Activation Resilience**: Fixed variable name typo (`workspaceFolder` -> `workspaceFolders`) in `MCPClientManager.loadConfigurations()` that was causing `ReferenceError` on extension startup.
- **Asynchronous Non-Blocking MCP Initialization**: Configured `mcpClient.initialize()` to run in background without blocking the synchronous registration of Sidebar Webview (`ag-universal-ai.sidebarView`) and Tree View (`ag-universal-ai.treeView`).

---

## [0.6.0] - 2026-08-30

### Added & Enhanced
- **Direct MCP Client Engine (`MCPClientManager`)**: Implemented full JSON-RPC 2.0 client over stdio, connecting directly to external MCP servers (Postgres, Git, Filesystem, Playwright, SQLite, Fetch) configured in `.vscode/mcp.json` or settings (`ag-universal-ai.mcpServers`), and dynamically binding tools into `ToolRegistry`.
- **Interactive Diff Preview (`AGDiffProvider`)**: Added virtual document content provider on scheme `ag-diff://` for side-by-side inspection (`vscode.diff`) before applying proposed code edits.
- **Embedded MCP Server Full Alignment**: Added official schemas for `ag_replaceInFile`, `ag_multiReplaceInFile`, `ag_getSelection`, and `ag_getDiagnostics` to `getMCPToolDefinitions()`.
- **Dynamic Tool Dispatching**: Extended `ToolRegistry` with `registerDynamicTool` and `unregisterDynamicTools` to support real-time MCP tool additions and removals.
- **Expanded Test Suite**: Added `test/mcp-client.test.ts` and `test/diff-provider.test.ts` bringing the automated test suite to 22 passing tests.

---

## [0.5.8] - 2026-08-30

### Added & Fixed
- **Agent Engine Fallback Tool Parser**: Implemented robust text JSON and codeblock tool call extraction (`extractToolCallsFromText`) in `AgentEngine`, allowing models without native function calling support (e.g. local Ollama models) to execute tools autonomously.
- **ToolRegistry Cleanup & Sanitization**: Removed duplicated properties and eliminated phantom `getCachedCompletion` / `buildCompletionPrompt` references from `ToolRegistry`.
- **Path Traversal Hardening**: Enforced strict root path containment with `path.posix.normalize` in `FileTools.resolveUri` and `EditTools.resolveUri`.
- **AbortSignal Propagation**: Added optional `signal` support in `ChatCompletionRequest`, `OpenAIAdapter.chat()`, and `AGInlineCompletionProvider` for immediate cancellation of in-flight completion requests.
- **Expanded Unit Test Suite**: Added dedicated unit tests for `EditTools` (`replaceInFile`, `multiReplaceInFile`, traversal blocking) and `AgentEngine` text JSON execution, expanding coverage to 20 automated tests.

---

## [0.5.3] - 2026-08-07

### Added & Fixed
- **Webview Event Binds & Input Trapping**: Direct `addEventListener` input trapping on `<textarea>` and toolbar buttons with `preventDefault()` and `stopPropagation()` to prevent unwanted newline insertions on Enter key.
- **IPC API Singleton Caching**: Captured `acquireVsCodeApi()` once into `window.__agVscApi` to prevent re-acquisition runtime exceptions.
- **Unit Test Suite**: 14 mocha/esbuild unit tests covering Provider Registry, MCP Protocol, OpenAI Adapter, ProviderManager, and SessionManager.
- **Status Bar Integration**: Enhanced latency and active model status display.

---

## [0.5.2] - 2026-08-06

### Added & Fixed
- **Precision Code Edits**: Added `ag_replaceInFile` and `ag_multiReplaceInFile` substring replacement tools.
- **Robust Path Validation**: Enhanced workspace relative path resolution and error trapping across file tools.

---

## [0.5.1] - 2026-08-06

### Added & Fixed
- **Multi-Session Dynamic Switcher**: Multi-session management with auto-titling and session persistence in `workspaceState`.
- **Webview Script Optimization**: Bundled webview script template generation for sub-5ms render response.

---

## [0.5.0] - 2026-08-06

### Added & Fixed
- **Multi-Persona SynAI Agent Harness**: Support for Supervisor, Planner, Code, Review, Security, Docs, and Database agent personas.
- **Direct MCP Integration**: Protocol handling for official and community MCP servers over `stdio` and `SSE`.
- **12+ AI Provider Presets**: Presets including Ollama, LM Studio, OpenAI, Groq, OpenRouter, DashScope Qwen, Kimi K3, DeepSeek, SiliconFlow, Together AI, Fireworks AI, and Z.ai GLM-5.2.

---

## [0.4.5] - 2026-08-06

### Fixed & Self-Healing Webview IPC Handshake
- **Dynamic API Acquisition (`getVsc()`)**: Replaced static `vsc = getVsc()` initialization with dynamic runtime resolution across all click handlers, dropdown listeners, and send routines to eliminate silent UI drops.
- **Heartbeat Self-Healing Handshake**: Implemented 1000ms periodic `{ type: 'ready' }` retry loop during webview initialization to guarantee state hydration (`selSession`, `history`, `providers`) even under iframe mount latency.
- **Resilient Stream Lock Recovery**: Ensured `streamEl` state resets immediately (`streamEl = null`) if IPC is unavailable during `doSend()`, preventing 12-second UI button blockages.

---

## [0.4.4] - 2026-08-06

### Fixed & Bulletproof IPC Architecture
- **Dual-Layer Redundant IPC Event Delegation**: Added inline `onclick="window.__agPost('...')"` handlers to HTML buttons alongside document-level event delegation.
- **Dynamic API Acquisition (`getVsc`)**: Added `getVsc()` lazy API resolver on client script execution and exposed `window.__agPost` and `window.__agSend` globally.
- **Visual Connection Error Diagnostics**: Added `#agWebviewStatus` banner to render immediate actionable error messages if VS Code API is ever disconnected.
- **Unrestricted CSP Policy**: Expanded CSP policy header to permit `script-src 'unsafe-inline' 'unsafe-eval'` to guarantee zero CSP script blocks in VS Code / Antigravity IDE.

---

## [0.4.3] - 2026-08-06

### Fixed & Critical Resolution
- **Eliminated Webview Runtime Syntax Error**: Replaced double-escaped `new RegExp(...)` constructor strings with compile-safe RegExp literals (`/.../g`). Fixed silent runtime `SyntaxError: Invalid escape` in Chromium Webview script that killed `ready` IPC signals and button event listeners.

---

## [0.4.2] - 2026-08-06

### Fixed & Enhanced
- **Failsafe Webview API Singleton**: Implemented `window.__agVscApi` singleton caching pattern to prevent duplicate `acquireVsCodeApi()` exceptions during Webview re-renders and IPC silent drops.
- **Bounded Model Listing (`Promise.race`)**: Enforced a strict 3000ms timeout on provider model queries (`listModels()`), eliminating session select deadlocks when remote AI cloud services experience network latency.
- **Multi-Stage Hydration Retries**: Added scheduled optimistic state updates at 0ms, 300ms, and 1000ms to eliminate Webview mounting race conditions.
- **Stale Stream Auto-Reset**: Added 12-second stale stream indicator reset in `doSend()` to prevent UI button lockups.

---

## [0.4.1] - 2026-08-06

### Fixed & Enhanced
- **Webview UI Syntax Resilience**: Solved root-level script parsing crash in webview template string generator (`getScript()`). Restored 100% IPC responsiveness for Send, Dashboard, Clear, New Session, and Attach File buttons.
- **Central Domain Synchronization**: Promoted Webview IPC resilience invariants and Direct MCP Architecture patterns to the central transversal domain hub (`E:\00Dev\agent skills e mais prod`).

---

## [0.4.0] - 2026-08-06

### Added
- **Single Core Architecture & Direct MCP Strategy**:
  - Direct connection to official and open-source MCP servers (`@modelcontextprotocol/sdk`) via `stdio`/`SSE`.
  - Matrix of recommended MCP servers (Filesystem, Git/GitHub, Postgres, Playwright, SQLite, Fetch, Docker, Memory).
  - Embedded AI Gateway layer for native multi-provider routing and token usage tracking.
  - Embedded SynAI sub-agent harness with multi-persona capability (Supervisor, Planner, Code, Review, Security, Database).

### Fixed
- Fixed TypeScript compilation errors (`TS2345`, `TS2353`, `TS2304`, `TS2341`) in `provider-manager.ts`, `session-manager.ts`, `types.ts`, `file-tools.ts`, and `sidebar-webview.ts`.
- Restored Markdown rendering and code block styling in sidebar chat webview.
- Enforced clean metadata footers across all `.md` documentation files according to `[dev]` transversal domain rules.

---

## [0.1.0] - 2026-07-30

### Added
- **Multi-Provider Engine**: Support for Ollama, LM Studio, OpenAI, Groq, OpenRouter, DashScope, Moonshot AI, DeepSeek, SiliconFlow, Together AI, Fireworks AI.
- **Interactive AI Chat (`@ag`)**: Native chat participant and custom sidebar webview panel.
- **Ghost Text Inline Completion**: Real-time Fill-in-the-Middle code suggestions.
- **Embedded MCP Server**: JSON-RPC 2.0 workspace tools and resources server.

---

**Versão:** 0.10.0 | **Última Revisão:** 2026-09-09 07:05:00
