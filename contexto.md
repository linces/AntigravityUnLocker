# Contexto & Histórico do Projeto — AG Universal AI

Este arquivo contém as decisões de arquitetura, convenções e histórico do desenvolvimento da extensão **AG Universal AI**.

---

## 🏛️ Visão Geral da Arquitetura (Single Core & Direct MCP Strategy)

O **AG Universal AI** opera como uma engine unificada e assistente de IA multi-provedor (12+ provedores local/cloud) integrado diretamente no VS Code e Antigravity IDE.

### Decisões Arquiteturais SSOT:
1. **Consolidação Single Core**:
   - A extensão atua como o único núcleo de processamento e orquestração local, abstraindo daemons e microsserviços externos.
   
2. **Estratégia Direct MCP**:
   - Integração direta via JSON-RPC 2.0 (`stdio` / `SSE`) com servidores MCP oficiais e da comunidade (Filesystem, Git/GitHub, Postgres, Playwright, SQLite, Fetch, Docker, Memory).

3. **Embedded AI Gateway Layer**:
   - Gerencia a seleção do provedor ativo, rota de fallback, limitação de taxa e métricas de consumo de tokens em tempo real.
   - Suporte nativo a 12+ provedores (Ollama, LM Studio, OpenAI, Groq, NVIDIA NIM, OpenRouter, DashScope Qwen, Moonshot Kimi, DeepSeek, SiliconFlow, Together AI, Fireworks AI e Z.ai GLM-5.2).

4. **Embedded SynAI Agent Engine**:
   - Executa loops autônomos com suporte a sub-agentes e personas (Supervisor, Planner, Code, Review, Security, Database).

---

## 📋 Convenções & Padrões (`[dev]`)

- **Privacidade & Segurança**: Nenhuma chave de API, caminho absoluto local ou PII pessoal é exposto no repositório. O arquivo `.env` local é mantido no `.gitignore`.
- **Política de Documentação**: Sem YAML Frontmatter no `README.md`. Rodapé padronizado em todos os arquivos `.md`.

---

## 🗺️ Repositório dos Domínios Transversais (`[dev]`)

> O repositório central de domínios transversais, KIs de referência, projetos `projects_registry.yaml` e utilitários do Domain Evolution Engine (DEE) está permanentemente localizado em:
>
> `E:\00Dev\agent skills e mais prod`

---

**Versão:** 0.5.8 | **Última Revisão:** 2026-08-30 17:18:00
