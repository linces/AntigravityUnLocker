# Troubleshooting & Webview IPC Resolution — Transversal Domain `[dev]`

## 🔴 Incident Postmortem: Webview UI Freeze & IPC Dysfunction

### Description of Issue
Todos os botões da interface Webview ("Send", "Dashboard", "New Chat", "Delete Session", "Clear", "Attach File", "Emoji", "Agent Pill", "Save Key" e seletores de dropdown) congelaram completamente, não reagindo a cliques ou envios de formulário.

---

## 🔍 Root Cause Analysis (Análise de Causa Raiz `[dev]`)

1. **Sintaxe Duplicada no Script Injetado (`getScript()`)**:
   No arquivo `src/ui/sidebar-webview.ts`, após o encerramento da função `md(s)` na linha 1280, existia um bloco de código duplicado fora de qualquer escopo de função (linhas 1281-1313).

2. **Falha Catastrófica de Parsing no Engine de Script do Webview**:
   A tentativa de executar a instrução global `text = esc(text);` fora de uma função (onde a variável `text` não existia) gerava um erro em tempo de parse/avaliação de JavaScript no navegador do Webview:
   `Uncaught ReferenceError: text is not defined`

3. **Incapacidade de Registro de Event Listeners**:
   Devido ao erro de sintaxe/referência no topo do script:
   - A chamada `acquireVsCodeApi()` não completava ou falhava.
   - Nenhum ouvinte de evento (`document.addEventListener('click')`, `document.addEventListener('change')`, `window.addEventListener('message')`) era registrado no DOM.
   - A mensagem inicial `{ type: 'ready' }` nunca era postada para a extensão.
   - O painel permanecia inerte sem comunicação IPC.

---

## 🛠️ Solução Aplicada & Regras de Prevenção

### 1. Correção Imediata
- Removido o bloco de código duplicado e órfão em `src/ui/sidebar-webview.ts`.
- Validada a sintaxe do script cliente dentro do bundle gerado com `npm run build` e `npx tsc --noEmit`.

### 2. Diretrizes Arquiteturais para Webviews (`[dev]`)

* **Regra 1: Isolamento Rigoroso de Scripts Injetados**:
  Todo código JavaScript cliente injetado em Webviews via template strings (`getScript()`) deve estar encapsulado dentro de uma IIFE (`(function(){ ... })();`) sem declarações de variáveis ou atribuições no escopo global órfão.

* **Regra 2: Tratamento e Captura de Erros no Top-Level do Webview**:
  Qualquer inicialização no script do Webview deve ser envolvida por um bloco `try/catch` global com logging para `console.error('[AG AI Webview Error]', err)`, evitando congelamentos silenciosos.

* **Regra 3: Teste de Integridade de IPC (`ready` signal)**:
  O manipulador `onDidReceiveMessage` da extensão deve aguardar e logar explicitamente a recepção de `{ type: 'ready' }` enviado pelo script do cliente. Se o evento `ready` não for recebido em até 2 segundos, um diagnóstico de script com falha deve ser emitido no log de saída.

---

## 🔴 Incident Postmortem 2: Extension Marked Invalid (`Unable to read package.json`)

### Description of Issue
Após instalar uma nova versão via CLI, o VS Code exibe um aviso amarelo: `⚠️ Invalid extensions detected` com o erro:
`Unable to read file '...\linces.ag-universal-ai-0.4.0\package.json' (Error: Unable to resolve nonexistent file...)`

### Root Cause Analysis
1. **Colisão de Executável no PATH (`code.py` vs `code.cmd`)**:
   No Windows, se a pasta de scripts do Python 3.11 (`Python311\Lib\code.py`) precede o diretório do VS Code no `PATH`, a execução do comando `code --install-extension file.vsix` executa silenciosamente o módulo Python `code.py`, que encerra com código 0 sem instalar o pacote `.vsix`.
2. **Corrupção do Registro `.obsolete`**:
   Ao tentar renomear ou copiar pastas manualmente na tentativa de contornar a falha enquanto o VS Code está aberto, a pasta antiga é marcada como obsoleta em `~/.vscode/extensions/.obsolete`. O VS Code tenta ler o `package.json` da versão obsoleta apagada e bloqueia a extensão como inválida.

### Solução Definitiva & Protocolo de Prevenção (`[dev]`)
1. **Usar Caminho Absoluto do Executável do VS Code**:
   Nunca execute apenas `code --install-extension`. Utilize sempre o caminho explícito do binário:
   `& "$env:LOCALAPPDATA\Programs\Microsoft VS Code\bin\code.cmd" --install-extension file.vsix --force`
2. **Limpeza do Registro `.obsolete`**:
   Em caso de corrupção, expurgar registros `linces.ag-universal-ai-*` dos arquivos `%USERPROFILE%\.vscode\extensions\.obsolete` e `extensions.json` antes de re-executar a instalação via `code.cmd`.

---

**Versão:** 0.4.1 | **Última Revisão:** 2026-08-06 18:51:00
