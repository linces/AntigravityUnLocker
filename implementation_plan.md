# Plano de Desbloqueio — ag-provider v0.1.1

Baseado na auditoria do conselho, este plano foca exclusivamente em **resolver os dois bugs bloqueantes** e realizar o **primeiro teste E2E real** com o Antigravity IDE.

Nenhuma feature nova será adicionada até que o pipeline core funcione de ponta a ponta.

---

## Fase 1: Reconhecimento — Captura de Tráfego Real

> [!IMPORTANT]
> **Não podemos corrigir o que não entendemos.** Antes de reescrever qualquer código, precisamos ver exatamente o que o IDE envia. Toda decisão arquitetural depende disto.

### 1.1 Criar Proxy de Diagnóstico

#### [NEW] [diagnosticProxy.ts](file:///e:/00Dev/AntigravityUnlock/src/ag-provider/src/diagnosticProxy.ts)

Um servidor mínimo (sem tradução, sem adapters) que:
- Escuta na porta 50051 (ou configurável)
- Aceita **qualquer** request HTTP/1.1 e HTTP/2 (usando `node:http2` com allowHTTP1 fallback)
- Loga para console e arquivo:
  - Método, URL, Headers completos
  - Content-Type exato
  - Raw body (hex dump + tentativa de UTF-8)
  - Tamanho em bytes
  - Se é HTTP/1.1 ou HTTP/2
- Responde com status 200 e um payload genérico para não crashar o IDE imediatamente

**Objetivo**: Apontar o IDE para este proxy, enviar uma mensagem no chat, e capturar o raw request.

### 1.2 Procedimento de Captura

1. Subir o `diagnosticProxy.ts` na porta 50051
2. Configurar o Antigravity IDE com `"antigravity.agentHostAddress": "http://127.0.0.1:50051"`
3. Enviar uma mensagem simples no chat do IDE (ex: "hello")
4. Capturar e analisar o output do proxy
5. Documentar os achados em um artefato de resultados

### 1.3 Perguntas que a captura vai responder

| Pergunta | Impacto na Implementação |
|----------|--------------------------|
| O IDE usa HTTP/1.1 ou HTTP/2? | Determina se podemos manter Express ou se precisamos migrar |
| Qual Content-Type o IDE envia? | `application/json` → mantemos JSON.parse; `application/connect+proto` → precisamos de Protobuf decoder |
| O body é JSON legível ou binário? | Confirma se o IDE usa Connect protocol em modo JSON ou binário |
| Quais headers são enviados? | Revela auth tokens, trace IDs, e metadados necessários |
| Qual rota/path o IDE chama? | Confirma se é `/google.cloud.conversa.v1.AgentService/StreamGenerateContent` ou outra |
| O IDE espera resposta streaming ou unary? | Define o padrão de resposta que precisamos implementar |

---

## Fase 2: Correção dos Bugs Bloqueantes

> [!WARNING]
> O escopo exato desta fase depende dos resultados da Fase 1. Abaixo estão os **dois cenários mais prováveis** e o plano para cada um.

### Cenário A: IDE envia JSON via Connect Protocol (otimista)

Se o Content-Type for `application/json` e o body for JSON legível:

#### [MODIFY] [index.ts](file:///e:/00Dev/AntigravityUnlock/src/ag-provider/src/index.ts)
- Substituir `express()` + `app.listen()` por servidor `node:http2` com `Http2ServerRequest`/`Http2ServerResponse`
- Habilitar flag `allowHTTP1: true` para aceitar ambos os protocolos
- Manter Express como handler de rotas via `createSecureServer` ou usar handler HTTP/2 nativo
- Gerar certificado auto-assinado local para TLS (HTTP/2 requer TLS na maioria dos clientes)

#### [MODIFY] [connectToOpenAI.ts](file:///e:/00Dev/AntigravityUnlock/src/ag-provider/src/translation/connectToOpenAI.ts)
- Manter `JSON.parse()` para bodies JSON
- Adicionar detecção de Content-Type para rotear entre JSON e binário
- Melhorar error handling com logs descritivos

### Cenário B: IDE envia Protobuf Binário (realista)

Se o Content-Type for `application/connect+proto` e o body for bytes binários:

#### [MODIFY] [index.ts](file:///e:/00Dev/AntigravityUnlock/src/ag-provider/src/index.ts)
- Migrar para `node:http2` (mesmo que Cenário A)

#### [MODIFY] [connectToOpenAI.ts](file:///e:/00Dev/AntigravityUnlock/src/ag-provider/src/translation/connectToOpenAI.ts)
- Extrair esquemas Protobuf do IDE (dos bundles webpack ou via reflection)
- Usar `@bufbuild/protobuf` para deserializar os frames binários
- Implementar decoder genérico que mapeia campos Protobuf numéricos para o nosso `ChatCompletionRequest`

#### [MODIFY] [openAiToConnect.ts](file:///e:/00Dev/AntigravityUnlock/src/ag-provider/src/translation/openAiToConnect.ts)
- Serializar respostas de volta em Protobuf binário
- Empacotar em envelopes ConnectRPC corretos

#### [NEW] [proto/](file:///e:/00Dev/AntigravityUnlock/src/ag-provider/src/proto/)
- Diretório com `.proto` extraídos ou reconstruídos
- Tipos gerados via `@bufbuild/protobuf`

### Cenário C: Modo Híbrido (ConnectRPC com negotiation)

Se o IDE suportar content negotiation, podemos forçar JSON:
- O server anuncia suporte apenas para `application/json`
- O cliente ConnectRPC do IDE faz fallback para JSON automaticamente
- Este seria o caminho de menor resistência

---

## Fase 3: Primeiro Teste E2E Real

#### [MODIFY] [index.ts](file:///e:/00Dev/AntigravityUnlock/src/ag-provider/src/index.ts)
- Adicionar logging detalhado de requests/responses no pipeline
- Adicionar endpoint de teste `POST /v1/test` para validação manual

### 3.1 Teste com Ollama Local (menor superfície de erro)

1. Garantir Ollama rodando com um modelo pequeno (ex: `qwen2.5-coder:7b`)
2. Configurar `providers.json` com `"default": "ollama-local"`
3. Subir ag-provider
4. Apontar IDE para `http://127.0.0.1:50051`
5. Enviar mensagem no chat
6. Verificar se a resposta aparece no IDE

### 3.2 Teste com API Cloud

7. Configurar API key (Kimi K3 ou SiliconFlow)
8. Repetir o teste com provider cloud
9. Verificar streaming funciona

---

## Fase 4: Alinhar Documentação com Realidade

#### [MODIFY] [bridge.md](file:///e:/00Dev/AntigravityUnlock/docs/bridge.md)
- Remover referências a `config.ts` e `server.ts` (não existem)
- Remover menção a "exponential backoff" (não implementado)
- Atualizar layout de diretórios para refletir a estrutura real

#### [MODIFY] [providers.md](file:///e:/00Dev/AntigravityUnlock/docs/providers.md)
- Alinhar interface `ILLMProvider` com a implementação real
- Remover métodos que não existem (`initialize`, `listModels`, `health`, `embeddings`)

#### [MODIFY] [README.md](file:///e:/00Dev/AntigravityUnlock/README.md)
- Trocar badge "Production-Ready" por "Alpha" ou "Experimental"
- Sincronizar com mudanças dos docs
- Atualizar versão para `0.1.1`

---

## Verificação

### Automatizada
```bash
cd src/ag-provider
npm run build    # TypeScript compila sem erros
npm start        # Server inicia sem crash
```

### Manual
1. **Fase 1**: Proxy de diagnóstico captura e exibe tráfego do IDE corretamente
2. **Fase 3**: Mensagem enviada no chat do IDE → resposta aparece de volta no IDE via ag-provider → Ollama

---

## Questões Abertas

> [!IMPORTANT]
> **Pergunta 1**: Você tem o Antigravity IDE instalado e acessível agora para fazermos a captura de tráfego? Sem ele, não temos como validar o protocolo.

> [!IMPORTANT]
> **Pergunta 2**: Você tem o Ollama instalado localmente, ou prefere usar uma API cloud (Kimi K3, SiliconFlow, etc.) para o primeiro teste E2E?

> [!IMPORTANT]
> **Pergunta 3**: Sobre o certificado TLS — para HTTP/2 local, precisamos de um certificado auto-assinado. Você se importa de ter que aceitar um cert auto-assinado no IDE, ou prefere tentarmos HTTP/2 cleartext (h2c) primeiro?

---

**Versão:** 1.0.0 | **Última Revisão:** 2026-07-26 08:02:00 -03:00
