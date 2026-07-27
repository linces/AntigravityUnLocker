---
domain: dev
category: project_management
type: task_matrix
created: 2026-07-25
last_updated: 2026-07-25T12:06:00-03:00
version: 1.4.0
---

# Project TODO - Antigravity Universal AI Provider

- [x] **Fase 1 — Identificação da tecnologia**: Mapeado (Electron 39.2.3, VS Code 1.107.0 fork, Node.js 22.20.0).
- [x] **Fase 2 — Inventário completo**: Executáveis, DLLs, bundles (`main.js`, `jetskiAgent/main.js`, `extension.js`) auditados.
- [x] **Fase 3 — Descoberta dos Providers**: Protocolo ConnectRPC (`@connectrpc/connect`) & Google Cloud AI Companion mapeados.
- [x] **Fase 4 — Engenharia da Comunicação**: Payload Protobuf, headers gRPC/HTTP2, SSE streaming documentados.
- [x] **Fase 5 — Captura de Tráfego**: Estrutura de pacotes e setup de instrumentação proxy configurado.
- [x] **Fase 6 — Descoberta da Arquitetura**: Ponto de extensão `agentHostAddress` identificado.
- [x] **Fase 7 — Modelo de Extensão**: Arquitetura de ponte intermediária (`ag-provider`) projetada.
- [x] **Relatórios em Markdown**:
  - [x] `architecture.md`
  - [x] `providers.md`
  - [x] `network.md`
  - [x] `bridge.md`
  - [x] `findings.md`
  - [x] `todo.md`
  - [x] `roadmap.md`
- [x] **Fase 8 — Projeto do Bridge (`ag-provider`)**:
  - [x] Inicializar projeto TypeScript `ag-provider`.
  - [x] Implementar servidor de pontes e rotas (`src/index.ts`).
  - [x] Criar adaptadores OpenAI-compatible (`OpenAIAdapter`, `OllamaAdapter`).
  - [x] Adicionar suporte aos novos modelos flagship: Kimi K3 (1M Context) e Qwen 3.8 (2.4T MoE).
  - [x] Implementar pipeline decodificador/codificador de envelopes binários ConnectRPC / Protobuf (`src/translation/`).
  - [x] Implementar Mapeamento Multimodal / Visão (`visionTranslation.ts`).
  - [x] Implementar Mapeamento de Chamadas de Ferramentas / Tool Calls (`toolsTranslation.ts`).
  - [x] Implementar roteamento dinâmico com fallback (`ProviderRouter`).
  - [x] Implementar arquivo de configuração `providers.json`.
  - [x] Criar Dashboard Web de monitoramento local (`/dashboard`) e endpoint `/health`.

- [x] **Fase 9 — Desbloqueio do Language Server (`v1internal`)**:
  - [x] Simulação de rotas `v1internal:loadCodeAssist`, `fetchAvailableModels`, `fetchUserInfo`, `retrieveUserQuotaSummary`.
  - [x] Resposta sintética `authState: AUTHENTICATED` para bypass completo do login do Google.
- [x] **Fase 10 — Sincronização SQLite & Correção de Onboarding**:
  - [x] Script `sync-auth.py` para injetar tokens SQLite no perfil `.test-ide-profile` sem locks de banco.
  - [x] Patch `scripts/patch_main_js.py` para stubbed `getProfileData` no `main.js`, eliminando requisições de rede com erro para `googleapis.com/oauth2/v2/userinfo` e prevenindo a tela de erro no onboarding.

---

**Versão:** 1.9.0 | **Última Revisão:** 2026-07-27 03:22:00

