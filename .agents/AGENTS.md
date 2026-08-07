# Workspace Rules - Antigravity Universal AI Provider

## 🏛️ DOMAIN [DEV] MANDATE & COGNITIVE HARNESS

This project strictly operates under the **`[dev]` Transversal Domain Rules**:
1. **Primitive Cognitive Harness**:
   `Checar -> Refazer -> Recontextualizar -> Refazer -> Rechecar -> Aprovar`
   - Always verify requirements & dependencies before coding.
   - Re-evaluate macro context (impact on other modules, memory/stream leaks, event emitters).
   - Test mental regression & verify against strict workspace rules before completion.
2. **Zero Stubs / Production Ready**:
   - Never output incomplete code, dummy fallbacks, or TODOs.
3. **Domain Evolution Protocol**:
   - All breakthroughs, architecture patterns, and troubleshooting procedures must be harvested and promoted through the Domain Evolution Engine (`projects_registry.yaml` & domain knowledge/skills).

---

## 🔒 PUBLIC GITHUB REPOSITORY SAFETY & PRIVACY RULE

This repository is **100% PUBLIC on GitHub**.
- **NEVER** expose local file paths, personal usernames, local drive letters, or internal environment PII anywhere in markdown files, source code, comments, or generated outputs.
- All file references must use clean, relative paths (e.g. `./docs/architecture.md`) or generic environment placeholders (e.g. `%LOCALAPPDATA%`, `~/.antigravity`).

---

## 📜 Mandatory Documentation Policy

### 1. NO YAML Frontmatter on README.md
- **NEVER** add YAML frontmatter blocks (`--- ... ---`) to `README.md`.
- `README.md` must start directly with the main title (`# Title`) and project badges for standard public GitHub rendering.

### 2. Clean Metadata Footer (Version & Timestamp Only)
All `.md` documents must end with the clean metadata footer:
```markdown
---

**Versão:** <X.Y.Z> | **Última Revisão:** <YYYY-MM-DD HH:mm:ss>
```

### 3. Continuous Automatic README Synchronization
Whenever any feature, code adapter, route, backend model, or documentation file is modified or added, `README.md` MUST be updated immediately in the same turn/step.

---

## ⚙️ Protocolo de Release & Correção de Webview (VSIX Deployment Workflow)

### 1. Webview Event Binds & Input Trapping Rule
- Todos os manipuladores de entrada em Webviews do VS Code (especialmente `<textarea>` e botões da toolbar) devem possuir captura direta (`addEventListener` nos elementos específicos com `e.preventDefault()` e `e.stopPropagation()`) para garantir o acionamento na tecla `Enter` (sem `Shift`) e impedir inserção involuntária de quebra de linha.
- O objeto de IPC `acquireVsCodeApi()` deve ser capturado exatamente **uma vez** na inicialização do script e mantido em cache seguro (`window.__agVscApi`) para evitar exceções por re-aquisição no ciclo do Webview.

### 2. Prevenção de Colisão de Backticks em Template Strings de Webview
- NUNCA utilizar expressões regulares ou literais contendo backticks (`\`\`\``) diretamente dentro de template strings TypeScript/JavaScript que geram o script cliente do Webview (`getScript()`). O empacotador (esbuild) pode desescapar os backticks e quebrar a sintaxe do script no navegador do Webview (`Uncaught SyntaxError`). SEMPRE utilizar a construção dinâmica `new RegExp(String.fromCharCode(96) + ...)`.
- Todo script de Webview DEVE injetar um handler `window.onerror` no topo da IIFE para capturar erros não tratados e exibir um aviso visual de diagnóstico (`#agWebviewStatus`).

### 3. Adaptador Universal de Streaming (Node vs Web ReadableStream)
- Requisições HTTP streaming (`fetch`) no ambiente Node/Electron do VS Code NUNCA devem assumir apenas `response.body.getReader()`. Devem sempre implementar suporte híbrido a `body.getReader()` e `Symbol.asyncIterator in body` para evitar a exceção `TypeError: response.body.getReader is not a function`.

### 4. Ciclo Obrigatório de Release & Atualização de Extensão (VSIX)
Sempre que uma alteração ou correção em componentes da extensão ou Webview for efetuada:
1. Incrementar a versão no `package.json` (ex: `0.4.6` ➔ `0.4.7`).
2. Atualizar badges de versão e rodapé de timestamp no `README.md` (`Continuous Automatic README Synchronization`).
3. Executar o build completo (`npm run build`).
4. Empacotar o novo VSIX (`npx @vscode/vsce package --no-dependencies --allow-star-activation`).
5. Reinstalar a extensão com override (`code --install-extension ag-universal-ai-<versao>.vsix --force`).
6. Instruir o recarregamento da janela (`Ctrl+Shift+P` ➔ `Developer: Reload Window`).

---

**Versão:** 0.5.4 | **Última Revisão:** 2026-08-07 13:03:00
