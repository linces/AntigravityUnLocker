---
domain: dev
category: findings_summary
type: documentation
created: 2026-07-25
last_updated: 2026-07-27T03:36:00-03:00
version: 2.0.0
---

# Findings Report - Reverse Engineering & Troubleshooting Antigravity IDE

> [!IMPORTANT]
> **CRITICAL ARCHITECTURE FACT**:
> The model selector dropdown **inside the Antigravity IDE UI** (e.g., *Gemini 3.6 Flash*) is **purely a visual frontend label**. Setting `jetski.cloudCodeUrl = "http://127.0.0.1:50051"` reroutes **100% of network traffic locally**. The **actual LLM engine** that responds to prompts is chosen dynamically in the **Web Control Dashboard (`http://127.0.0.1:50051/dashboard`)**. Google servers receive ZERO requests during prompt execution.

---

## Key Discoveries & Technical Insights

### 1. Engine & Runtime
- **Core Engine**: Antigravity IDE is built on a customized Google fork of VS Code (`1.107.0`), executing within Electron `39.2.3` and Node.js `22.20.0`.
- **Packaging**: Standard Electron application hierarchy with node modules and main webpack bundles (`out/main.js`, `out/jetskiAgent/main.js`, `extensions/antigravity/dist/extension.js`).

### 2. Network & RPC Architecture
- **Protocol**: Binary **Protocol Buffers** (`@bufbuild/protobuf`) over **ConnectRPC** (`@connectrpc/connect`, `@connectrpc/connect-node`).
- **Endpoint Target**: `cloudaicompanion.googleapis.com` (Google Cloud AI Companion / Conversa service).
- **Communication Flow**:
  1. The IDE agent engine packages project context, prompt messages, active tools, and diff histories into Protobuf payload structures.
  2. The payload is transmitted over an HTTP/2 ConnectRPC stream.
  3. The response is streamed chunk-by-chunk via gRPC/Connect server-sent frames.

### 3. Integration Strategy (`ag-provider`)
- An external proxy process (`ag-provider`) listening on `127.0.0.1:50051` intercepts ConnectRPC calls.
- `ag-provider` translates binary ConnectRPC messages into standard OpenAI `v1/chat/completions` API format, enabling usage of local runners (Ollama, LM Studio, llama.cpp) and cloud backends (OpenRouter, DeepSeek, Qwen, vLLM, SiliconFlow, Kimi).

---

## Post-Mortem & Failures Log (O Que Deu Errado e Lições Aprendidas)

Esta seção documenta todos os problemas técnicos, falhas de premissa, erros de inicialização e comportamentos de borda encontrados durante a engenharia reversa para evitar reincidência.

### 1. Falha ao Usar Apenas Variáveis de Ambiente (`$env:CLOUD_CODE_ENDPOINT`)
* **Problema**: Inicialmente tentou-se redirecionar o tráfego da IDE definindo apenas variáveis de ambiente como `CLOUD_CODE_ENDPOINT` ou `CODEIUM_CLOUD_CODE_ENDPOINT`.
* **Causa Raiz**: O executável do Language Server (`language_server_windows_x64.exe`) ignora variáveis de ambiente se o serviço de configuração da IDE não possuir o override explícito em nível de usuário.
* **Solução Definitiva**: Deve-se injetar `"jetski.cloudCodeUrl": "http://127.0.0.1:50051"` e `"antigravity.agentHostAddress": "http://127.0.0.1:50051"` dentro do arquivo `./.test-ide-profile/User/settings.json`.

### 2. Loop Infinito do Language Server ("Model Not Found")
* **Problema**: O Language Server entrava em falha contínua emitindo erros `Cannot POST /v1internal:loadCodeAssist` e `unknown model key MODEL_PLACEHOLDER_M71: model not found`.
* **Causa Raiz**: O Language Server exige endpoints internos de bootstrap (`v1internal`) antes de permitir qualquer requisição de chat. Se o proxy retornar 404 nessas rotas, o LS bloqueia a execução.
* **Solução Definitiva**: Implementação do módulo `./src/ag-provider/src/routes/v1internal.ts` no proxy, que simula as rotas `/v1internal:loadCodeAssist`, `/v1internal:fetchAvailableModels`, `/v1internal:fetchUserInfo` e `/v1internal:retrieveUserQuotaSummary`, retornando estado sintético `authState: "AUTHENTICATED"`.

### 3. Concorrência e Lock de Banco de Dados SQLite (`state.vscdb`)
* **Problema**: Ao rodar scripts de sincronização de token (`sync-auth.py`), o estado de autenticação falhava silenciosamente e a IDE exibia aviso de erro de login.
* **Causa Raiz**: Se o processo `Antigravity IDE.exe` já estivesse em execução no perfil de teste, a DLL SQLite do Electron mantinha lock exclusivo em `%APPDATA%/.../state.vscdb` e no perfil de teste `./.test-ide-profile/User/globalStorage/state.vscdb`. A gravação falhava e a chave ficava corrompida com `"state": "loginError"`.
* **Solução Definitiva**: O script `sync-auth.py` agora encerra instâncias ativas do perfil de teste (`taskkill /F /IM "Antigravity IDE.exe"`) antes de realizar a gravação no SQLite, garantindo liberação dos locks de arquivo.

### 4. Chamada de Rede Externa Hardcoded (`getProfileData` no Electron Main)
* **Problema**: Mesmo com o proxy rodando e com o perfil autenticado, a IDE por vezes exibia o modal de erro *"There was an unexpected issue setting up your account"*.
* **Causa Raiz**: Ao analisar o bundle `./out/main.js` descompilado, descobriu-se que o método `refreshUserStatus` chamava `getProfileData`, que continha a URL hardcoded `https://www.googleapis.com/oauth2/v2/userinfo`. Esta era a **única chamada HTTPS externa** feita diretamente pelo Electron sem passar pelo `jetski.cloudCodeUrl`. Se o token do usuário estivesse expirado ou a rede local bloqueasse a chamada, `getProfileData` lançava uma exceção que ativava a ação `SET_ERROR` na máquina de estados XState.
* **Solução Definitiva**: Criação do script `./scripts/patch_main_js.py`, que sobrescreve cirurgicamente o método `getProfileData(t)` no `main.js` para retornar imediatamente um objeto estático mockado (`{name: "AG Provider User", email: "ag-provider@localhost"}`), eliminando 100% de tráfego para a internet.

### 5. Mecanismo de Disparo do Modal de Erro UI (`workbench.desktop.main.js`)
* **Problema**: A interpretação inicial supôs que o modal de erro *"There was an unexpected issue setting up your account"* ocorria devido a uma rejeição remota por parte dos servidores de autenticação da Google durante a chamada do usuário.
* **Causa Raiz**: A descompilação do bundle React do workbench (`workbench.desktop.main.js`, linha 14673697) revelou que a função `S8o` lê o estado da máquina XState gravado no SQLite (`antigravityUnifiedStateSync.oauthToken`). Se o objeto contiver `errorMessage !== ""` ou `ineligibleMessage !== ""`, a regra de transição (*guard*) desvia automaticamente o estado para `loginError`, renderizando a tela de erro local.
* **Solução Definitiva**: O script `sync-auth.py` higieniza a string de estado no SQLite, limpando os campos `errorMessage` e garantindo que o estado gravado seja estritamente `"signedIn"`.

---

**Versão:** 2.0.0 | **Última Revisão:** 2026-07-27 03:36:00
