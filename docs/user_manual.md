---
domain: dev
category: user_guide
type: documentation
created: 2026-07-25
last_updated: 2026-07-27T00:10:00-03:00
version: 1.5.0
---

# Manual de Operação & Uso Detalhado — Antigravity Universal AI Provider (`ag-provider`)

## Índice

1. [Entendendo a Arquitetura & O Login do Google](#1-entendendo-a-arquitetura--o-login-do-google)
2. [Seletor do Antigravity IDE vs. Web Dashboard](#2-seletor-do-antigravity-ide-vs-web-dashboard)
3. [Segurança Total e Gerenciamento de Chaves (`.env` & `.gitignore`)](#3-segurança-total-e-gerenciamento-de-chaves-env--gitignore)
4. [Links Oficiais para Obtenção de Chaves de API](#4-links-oficiais-para-obtenção-de-chaves-de-api)
5. [Passo a Passo 1: Instalação e Compilação do `ag-provider`](#5-passo-a-passo-1-instalação-e-compilação-do-ag-provider)
6. [Passo a Passo 2: Executando o Servidor Proxy Ponte](#6-passo-a-passo-2-executando-o-servidor-proxy-ponte)
7. [Passo a Passo 3: Abrindo e Configurando o Antigravity IDE](#7-passo-a-passo-3-abrindo-e-configurando-o-antigravity-ide)
8. [Passo a Passo 4: Uso no Dia a Dia & Troca de Modelos em Tempo Real](#8-passo-a-passo-4-uso-no-dia-a-dia--troca-de-modelos-em-tempo-real)
9. [Solução de Problemas & Diagnósticos (Troubleshooting)](#9-solução-de-problemas--diagnósticos-troubleshooting)

---

## 1. Entendendo a Arquitetura & O Login do Google

### Por que a IDE exige login com a conta do Google?

O **Antigravity IDE** é baseado em uma distribuição customizada do VS Code. Para desbloquear e liberar o painel de chat e a gaveta do assistente na interface do usuário, a IDE exige a autenticação através de uma conta Google OAuth.

### Como o `ag-provider` intercepta o tráfego?

Quando você define a variável de ambiente `$env:CLOUD_CODE_ENDPOINT = "http://127.0.0.1:50051"` (ou adiciona `"antigravity.agentHostAddress": "http://127.0.0.1:50051"` no `settings.json`), o cliente de rede interno da IDE (ConnectRPC / Protobuf) **redireciona 100% do tráfego das LLMs para o seu servidor local `ag-provider`**.

```
+-------------------+           ConnectRPC Stream          +-------------------+
|  Antigravity IDE  |  --------------------------------->  |    ag-provider    |
|   (Electron Host) |   http://127.0.0.1:50051             |   (Local Proxy)   |
+-------------------+                                      +-------------------+
                                                                     |
                                                       OpenAI REST   | / SSE Stream
                                                                     v
                                                           +-------------------+
                                                           | Target LLM API    |
                                                           | (Kimi/Qwen/Groq/  |
                                                           | OpenRouter/Local) |
                                                           +-------------------+
```

- **Sua conta Google NÃO é cobrada.**
- **Nenhum dado de prompt é enviado aos servidores do Google AI.**
- O tráfego passa integralmente e localmente pela porta `50051`.

---

## 2. Seletor do Antigravity IDE vs. Web Dashboard

É comum ter dúvidas sobre onde escolher qual IA responderá às suas perguntas. Entenda como cada parte funciona:

1. **Menu Suspenso na Interface da IDE (ex: *Gemini 3.6 Flash*)**:
   - Funciona puramente como um rótulo visual na interface. Você pode deixar qualquer modelo selecionado lá.
2. **Painel de Controle Web (`http://127.0.0.1:50051/dashboard`)**:
   - É **aqui** que a magia acontece. O Dashboard web controla qual provedor ativo o `ag-provider` utilizará para responder às requisições vindo da IDE.
   - Quando você seleciona **Groq** ou **Kimi K3** no Dashboard e clica em **Switch Active Provider**, a próxima requisição feita no chat da IDE responderá usando aquele modelo exato.

---

## 3. Segurança Total e Gerenciamento de Chaves (`.env` & `.gitignore`)

Para garantir que suas chaves de API jamais vazem ou sejam commitadas em repositórios do GitHub:

1. **Arquivo `.env` Local**:
   - As chaves de API secretas ficam armazenadas exclusivamente no arquivo `src/ag-provider/.env`.
2. **Proteção `.gitignore`**:
   - O arquivo `.gitignore` na raiz e na pasta do `ag-provider` já contêm `.env` registrado.
3. **Arquivo Público `providers.json`**:
   - O arquivo [`providers.json`](../src/ag-provider/providers.json) utiliza marcadores genéricos (ex: `${KIMI_API_KEY}`, `${GROQ_API_KEY}`). O `ag-provider` substitui dinamicamente esses marcadores pelas variáveis de ambiente do `.env` ao iniciar.

---

## 4. Links Oficiais para Obtenção de Chaves de API

Abaixo estão os links oficiais dos provedores suportados para você criar conta e gerar suas chaves gratuitamente ou com créditos de teste:

| Provedor | Modelo em Destaque | Link Oficial de Cadastro / API Keys | Variável no `.env` |
| :--- | :--- | :--- | :--- |
| **Kimi K3 (Moonshot AI)** | `kimi-k3` (1M Context) | 🔗 [Moonshot Platform Console](https://platform.moonshot.cn/) | `KIMI_API_KEY` |
| **Qwen 3.8 / Max (DashScope)** | `qwen3.8-max-preview` (2.4T MoE) | 🔗 [Alibaba DashScope Console](https://dashscope.aliyun.com/) | `DASHSCOPE_API_KEY` |
| **Groq Fast Inference** | `llama-3.3-70b-versatile` | 🔗 [Groq Cloud Console](https://console.groq.com/keys) | `GROQ_API_KEY` |
| **SiliconFlow** | `Qwen2.5-Coder-32B` / `DeepSeek` | 🔗 [SiliconFlow Platform](https://cloud.siliconflow.cn/) | `SILICONFLOW_API_KEY` |
| **OpenRouter** | Multi-modelos (Claude, GPT-4, Llama) | 🔗 [OpenRouter Keys](https://openrouter.ai/keys) | `OPENROUTER_API_KEY` |
| **DeepSeek** | `deepseek-chat` / `deepseek-reasoner` | 🔗 [DeepSeek Platform](https://platform.deepseek.com/) | `DEEPSEEK_API_KEY` |
| **Ollama Local** | Modelos Locais (Offline) | 🔗 [Ollama Official Website](https://ollama.com/) | *Não exige chave* |
| **LM Studio** | Execução GGUF Local | 🔗 [LM Studio Official Website](https://lmstudio.ai/) | *Não exige chave* |

---

## 5. Passo a Passo 1: Instalação e Compilação do `ag-provider`

### 1. Criar o arquivo `.env`
Navegue até a pasta do servidor e crie o arquivo `.env`:

**Caminho:** `E:\00Dev\AntigravityUnlock\src\ag-provider\.env`

```env
KIMI_API_KEY=sk-sua-chave-kimi-aqui
DASHSCOPE_API_KEY=sk-sua-chave-dashscope-aqui
GROQ_API_KEY=gsk_sua-chave-groq-aqui
SILICONFLOW_API_KEY=sk-sua-chave-siliconflow-aqui
OPENROUTER_API_KEY=sk-or-v1-sua-chave-openrouter-aqui
DEEPSEEK_API_KEY=sk-sua-chave-deepseek-aqui
```

### 2. Instalar dependências e compilar
No terminal PowerShell:

```powershell
cd E:\00Dev\AntigravityUnlock\src\ag-provider
npm install
npm run build
```

---

## 6. Passo a Passo 2: Executando o Servidor Proxy Ponte

Para iniciar o servidor proxy local:

```powershell
cd E:\00Dev\AntigravityUnlock\src\ag-provider
npm start
```

Você verá a seguinte confirmação no terminal:

```text
=======================================================
  Antigravity Universal AI Provider Bridge (ag-provider) 
  Control Panel: http://127.0.0.1:50051/dashboard
  Running on http://127.0.0.1:50051
=======================================================
```

- **Verificação de Saúde (Health Check)**: Acesse `http://127.0.0.1:50051/health` no navegador.
- **Painel de Controle Web**: Acesse `http://127.0.0.1:50051/dashboard` no navegador.

---

## 7. Passo a Passo 3: Abrindo e Configurando o Antigravity IDE

Abra uma **segunda janela de terminal PowerShell** (mantendo o servidor `ag-provider` rodando na primeira) e execute o script de inicialização:

```powershell
# 1. Redirecionar o tráfego do agente para a porta local 50051
$env:CLOUD_CODE_ENDPOINT = "http://127.0.0.1:50051"
$env:CODEIUM_CLOUD_CODE_ENDPOINT = "http://127.0.0.1:50051"

# 2. Iniciar o Antigravity IDE
Start-Process "$env:LOCALAPPDATA\Programs\Antigravity IDE\Antigravity IDE.exe" -ArgumentList "--user-data-dir=`"E:\00Dev\AntigravityUnlock\.test-ide-profile`"","--new-window"
```

---

## 8. Passo a Passo 4: Uso no Dia a Dia & Troca de Modelos em Tempo Real

1. **Fazer Login na IDE**: Na janela do Antigravity IDE que abriu, faça login com sua conta do Google para liberar o painel de chat.
2. **Abrir o Painel Web**: No seu navegador (Chrome/Edge/Firefox), abra `http://127.0.0.1:50051/dashboard`.
3. **Alternar Provedores**:
   - No menu suspenso do Dashboard, selecione o modelo desejado (ex: **Groq Fast Inference**, **Kimi K3**, **Qwen 3.8** ou **Ollama Local**).
   - Clique no botão **Switch Active Provider**.
4. **Enviar Mensagens no Chat da IDE**:
   - Digite qualquer instrução no chat da IDE. A resposta será processada instantaneamente pelo modelo que você ativou no Dashboard.

---

## 9. Solução de Problemas & Diagnósticos (Troubleshooting)

### A porta 50051 não responde ou dá erro de conexão
- **Causa**: O servidor `ag-provider` não foi iniciado ou foi encerrado.
- **Solução**: Verifique se a primeira janela de terminal onde você rodou `npm start` continua aberta.

### O modelo retorna erro 500 ou aviso de chave ausente
- **Causa**: A chave de API do provedor específico não foi configurada no `.env`.
- **Solução**: Abra `src/ag-provider/.env`, insira a chave válida e reinicie o proxy com `npm start`.

### As respostas não parecem mudar ao trocar o modelo no seletor da IDE
- **Causa**: O seletor interno da IDE é meramente visual.
- **Solução**: Certifique-se de alternar o modelo através do **Web Control Dashboard** em `http://127.0.0.1:50051/dashboard`.

---

**Versão:** 1.5.0 | **Última Revisão:** 2026-07-27 00:10:00 -03:00
