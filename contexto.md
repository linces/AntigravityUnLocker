# Contexto & Histórico do Projeto — AG Universal AI

Este arquivo contém as decisões de arquitetura, convenções e histórico do desenvolvimento da extensão **AG Universal AI**.

---

## 🏛️ Visão Geral da Arquitetura

O **AG Universal AI** é uma extensão para VS Code e Antigravity IDE que fornece assistência de IA multi-provedor (Ollama, OpenAI, Groq, NVIDIA NIM, OpenRouter, DashScope, Moonshot Kimi, DeepSeek, SiliconFlow, Together AI, Fireworks AI e Z.ai GLM-5.2).

### Componentes Principais:
1. **Provider Manager (`src/providers/provider-manager.ts`)**:
   - Gerencia a seleção do provedor ativo e isolamento do modelo preferido por provedor.
   - Carrega chaves de API automaticamente a partir do SecretStorage ou arquivo local `.env` (chaves gitignored).

2. **Provedor Z.ai / GLM 5.2 (`src/providers/provider-registry.ts`)**:
   - Provedor ID: `zai-glm`
   - Modelo Flagship: `glm-5.2` (Contexto de 1M tokens)
   - Base URL: `https://api.z.ai/api/coding/paas/v4`

3. **Gerenciador de Sessões de Chat (`src/chat/session-manager.ts`)**:
   - Persistência de sessões de chat em `workspaceState`.
   - Suporte a múltiplas conversas (Criar `➕`, Alternar `📜`, Excluir `🗑️`, Limpar `🧹`).
   - Nomeação automática de sessões baseada na primeira pergunta do usuário.

4. **Detecção Automática de Contexto do Projeto**:
   - O assistente lê automaticamente arquivos como `contexto.md`, `notas.md`, `AGENTS.md` e `.ag/context.md` no workspace ativo para manter o alinhamento de decisões e regras.

---

## 📋 Convenções & Padrões

- **Privacidade & Segurança**: Nenhuma chave de API ou PII pessoal deve ser versionada no Git. O arquivo `.env` local é mantido no `.gitignore`.
- **UI Webview**: Todos os manipuladores de evento utilizam delegação em tempo de execução compatível com CSP Nonce do VS Code.

---

**Versão:** 0.4.0 | **Última Revisão:** 2026-08-06 00:20:00
