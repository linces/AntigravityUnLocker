# 🏛️ AG Universal AI — Parecer Geral do Conselho & Roadmap Estratégico

## 📊 1. Sumário Executivo & Índice de Maturidade

O **Conselho de Engenharia e Arquitetura de Software** realizou uma auditoria completa, profunda e multidimensional no projeto **AG Universal AI**.

O projeto atua como uma **extensão unificada para VS Code e Antigravity IDE**, integrando:
1. **Embedded AI Gateway** com 12+ provedores (Ollama, LM Studio, OpenAI, Groq, NVIDIA NIM, OpenRouter, DashScope Qwen, Moonshot Kimi, DeepSeek, SiliconFlow, Together AI, Fireworks AI e Z.ai GLM-5.2).
2. **Assistente de Chat Híbrido** (Webview estilo Cursor/Kimi + Participante Nativo `@ag`).
3. **Ghost Text Inline Completion (FIM)**.
4. **Embedded SynAI Agent Engine** (Plan-Then-Act com ferramentas de workspace/edição).
5. **Servidor MCP Embarcado (JSON-RPC 2.0)** e fundação para Direct MCP Client.

### 🎯 Scorecard Dimensional do Conselho

| Dimensão Auditada | Nota (0 a 10) | Status | Parecer do Conselho |
| :--- | :---: | :---: | :--- |
| **1. Arquitetura & Design de Sistemas** | **8.8** | 🟢 Sólido | Excelente desacoplamento e ciclo de vida, com redundância residual em `ToolRegistry`. |
| **2. Segurança & Zero Trust** | **8.5** | 🟢 Seguro | `SecretStorage` robusto e CSP rígido; sanitização de terminal e path traversal demandam hardening. |
| **3. Performance, Concorrência & Streams** | **8.7** | 🟢 Otimizado | Streaming híbrido (Node/Web) de alta resiliência; spinlocks de config podem evoluir para Mutex. |
| **4. Orquestração de IA & Agentes** | **8.2** | 🟡 Bom com Alerta | Loop Plan-Then-Act funcional; fallback de function-calling em modelos sem ferramentas nativas tem gap de parse. |
| **5. Frontend Webview & UX/DX** | **9.2** | 🟢 Excelente | Resolução definitiva de IPC, auto-recuperação e suporte a clipboard/imagens de alto nível. |
| **6. Qualidade, Testabilidade & DevOps** | **8.5** | 🟢 Confiável | Suíte rápida com bundle esbuild e mock nativo (14 testes passando em 1s); gaps em testes agênticos. |
| **7. Visão de Produto & Ecossistema** | **9.0** | 🟢 Competitivo | Paridade com ferramentas comerciais de ponta (Cursor, Roo Code, Cline) com soberania local (Ollama). |
| **ÍNDICE GERAL DE MATURIDADE (SSOT)** | **8.7 / 10** | 🟢 **PRODUÇÃO COM RECOMENDAÇÕES** |

---

## 🔍 2. Tribunal do Conselho: Análise Dimensional Detalhada

### 🏛️ DIMENSÃO 1: ARQUITETURA DE SOFTWARE & DESIGN DE SISTEMAS
- **Single Core Engine & Lifecycle**: `extension.ts` orquestra todas as camadas de forma limpa, garantindo registro em `context.subscriptions`.
- **Desacoplamento do Gateway**: `ProviderManager` atua como SSOT para seleção de modelos, health checks, fallback e persistência de credenciais.
- **Identificação de Código Órfão**: `ToolRegistry` continha propriedades duplicadas e método fantasma `getCachedCompletion` com chamada para `buildCompletionPrompt` inexistente.

### 🔒 DIMENSÃO 2: SEGURANÇA OFENSIVA, DEFENSIVA & PRIVACIDADE
- **Credenciais em SecretStorage**: Chaves armazenadas no Keyring nativo com migração automática a partir do `.env` local (gitignored).
- **Hardening de Path Traversal**: `resolveUri` em `FileTools` e `EditTools` necessita de contenção estrita (`fsPath.startsWith(workspaceRoot.fsPath)`).
- **Sanitização de Terminal**: `TerminalTools` implementa blocklist básica de comandos destrutivos e confirmação modal em execuções de risco.

### ⚡ DIMENSÃO 3: PERFORMANCE, CONCORRÊNCIA & ENGENHARIA DE STREAMS
- **Adaptador Universal de Streaming**: Suporte duplo a `body.getReader()` e `Symbol.asyncIterator in body` em `OpenAIAdapter`, eliminando falhas de streaming em Node 18+/Electron.
- **Sincronização Atômica de Configurações**: Prevenção de race conditions durante a troca de provedor ativo e modelo.

### 🤖 DIMENSÃO 4: ORQUESTRAÇÃO AGÊNTICA, LLMS & PROTOCOLO MCP
- **Ciclo Plan-Then-Act**: Decomposição em etapas estruturadas com rationale e harness de autocorreção em tempo real.
- **Fallback de Tool Calling**: Gap identificado em modelos sem suporte a function calling nativo; necessidade de extrator robusto de JSON/Regex a partir de `assistantMessage.content`.
- **Propagação de Cancelamento em Inline Completion**: Adicionar suporte a `AbortSignal` no `ChatCompletionRequest`.

### 🎨 DIMENSÃO 5: FRONTEND WEBVIEW, UX/DX & RESILIÊNCIA DE UI
- **Singleton IPC (`window.__agVscApi`)**: Eliminação de falhas de re-aquisição de API no Chromium.
- **Prevenção de Colisão de Backticks**: Construção segura de expressões regulares dentro de templates do Webview via `String.fromCharCode(96)`.
- **Auto-recuperação e Handshake**: Loop de retentativas para sinal `{ type: 'ready' }` e desbloqueio de estado de streaming.

### 🧪 DIMENSÃO 6: QUALIDADE, TESTABILIDADE & ENGENHARIA DE DEVOPS
- **Suíte de Testes Instantânea**: 14 testes cobrindo presets, MCP, adapters e session management rodando em ~1 segundo.
- **Gaps a Cobrir**: Criação de testes unitários dedicados para `EditTools` (`replaceInFile`, `multiReplaceInFile`) e `AgentEngine`.

### 💼 DIMENSÃO 7: VISÃO DE PRODUTO & ECOSSISTEMA
- **Soberania Local + Nuvem Global**: 100% de privacidade com Ollama/LM Studio e suporte a modelos de fronteira (DeepSeek R1/V3, Qwen 2.5 Coder, Kimi, OpenAI o1/o3-mini).

---

## 📋 3. Matriz Consolidada de Vulnerabilidades, Gaps & Correções

| ID | Componente | Severidade | Descrição do Diagnóstico | Ação Corretiva |
| :---: | :--- | :---: | :--- | :--- |
| **G-01** | `src/agent/engine.ts` | 🔴 **ALTA** | Modelos sem tool calling nativo não tinham JSON de `content` parseado. | Implementar extrator de JSON/Regex no `content` do assistente para execução de ferramentas. |
| **G-02** | `src/tools/tool-registry.ts` | 🟡 **MÉDIA** | Propriedades duplicadas e método órfão `getCachedCompletion` com chamada inválida. | Remover propriedades duplicadas e método órfão em `ToolRegistry`. |
| **G-03** | `src/tools/file-tools.ts` & `edit-tools.ts` | 🟡 **MÉDIA** | `resolveUri` não validava contenção estrita dentro do workspace. | Adicionar validação de contenção de path (`fsPath.startsWith(root.fsPath)`). |
| **G-04** | `src/completion/inline-provider.ts` | 🔵 **BAIXA** | `AbortController` criado no token de cancelamento não era propagado no `chat()`. | Suportar `signal?: AbortSignal` em `ChatCompletionRequest` e no adaptador. |
| **G-05** | `src/lm/chat-provider.ts` | 🔵 **BAIXA** | `register()` era no-op logging. | Manter documentado e desacoplado via Chat Participant `@ag`. |

---

## 🚀 4. Roadmap Tático (v0.5.8+)

- [x] **v0.5.8**:
  - [x] Correção de `AgentEngine` com parser JSON fallback para modelos sem tools nativas.
  - [x] Limpeza e saneamento de `ToolRegistry`.
  - [x] Hardening de contenção de caminhos (`resolveUri`) em ferramentas de arquivo e edição.
  - [x] Propagação de `AbortSignal` em `ChatCompletionRequest`.
  - [x] Expansão da suíte de testes unitários para `EditTools` e `AgentEngine`.
- [x] **v0.6.0**:
  - [x] Direct MCP Client Engine nativo (`MCPClientManager`) via stdio JSON-RPC 2.0 com descoberta dinâmica de ferramentas.
  - [x] Visualização de Diff interativo side-by-side (`AGDiffProvider` no esquema `ag-diff://`) com `vscode.diff`.
  - [x] Alinhamento total de schemas de ferramentas no servidor MCP embarcado (9 ferramentas de workspace).
  - [x] Suíte de testes automatizados expandida para 22 testes unitários.
- [x] **v0.6.3**:
  - [x] Eliminação definitiva do erro de sintaxe de expressão regular (`Unterminated group`) em `sidebar-webview.ts` através de construtor `RegExp` seguro.
  - [x] Revalidação completa do script cliente do Webview em runtime VM e restauração total de cliques e botões de ação.
- [ ] **v0.7.0**:
  - [ ] Suporte a transportes SSE / HTTP remotos no MCP Client Engine.
  - [ ] Multi-persona Agent Swarm com delegação paralela de sub-tarefas.

---

**Versão:** 0.6.3 | **Última Revisão:** 2026-08-31 09:07:00