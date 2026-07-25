# Projeto: Antigravity Universal AI Provider

## Objetivo

Realizar engenharia reversa da arquitetura do Antigravity IDE para permitir o uso de qualquer backend compatível com a API OpenAI.

O objetivo NÃO é remover autenticação, quebrar licenciamento ou modificar mecanismos de segurança.

O objetivo é descobrir como o IDE conversa com os modelos de IA e criar uma camada de compatibilidade que permita utilizar provedores como:

- OpenRouter
- Ollama
- llama.cpp
- LM Studio
- vLLM
- SiliconFlow
- Kimi
- Qwen
- DeepSeek
- GLM
- OpenAI
- Groq
- Together
- Fireworks
- qualquer endpoint OpenAI-compatible

---

# Regras

Nunca modificar arquivos sem criar backup.

Todo experimento deve ser reversível.

Toda descoberta deve ser documentada.

Gerar um relatório em Markdown.

Usar Git para cada alteração.

Nunca assumir nada sem validar.

---

# Fase 1 — Identificação da tecnologia

Descobrir:

- Linguagem utilizada
- Framework
- Runtime
- Estrutura de diretórios
- Tipo de empacotamento

Identificar se utiliza:

- Electron
- Flutter
- Tauri
- Qt
- .NET
- Java
- outro

Produzir:

```
architecture.md
```

---

# Fase 2 — Inventário completo

Mapear:

Executáveis

DLLs

Node Modules

Resources

Bundles

Assets

Configurações

Banco local

Cache

Logs

Arquivos JSON

YAML

SQLite

LevelDB

Protocol Buffers

etc.

Gerar árvore completa.

---

# Fase 3 — Descoberta dos Providers

Encontrar todo código relacionado a:

Provider

Model

LLM

Gemini

Claude

GPT

OpenAI

API

Inference

Backend

Endpoint

Chat

Completion

Responses

Tools

Streaming

SSE

WebSocket

HTTP Client

Fetch

Axios

gRPC

---

# Fase 4 — Engenharia da Comunicação

Mapear:

Endpoints

Headers

Authorization

Payload

Streaming

Eventos

Timeouts

Retries

Formato JSON

Mensagens

Tool Calls

Embeddings

Vision

Code Actions

Agent Messages

---

# Fase 5 — Captura de Tráfego

Instrumentar todas as chamadas HTTP.

Registrar:

URL

Headers

Body

Resposta

Tempo

Streaming

Chunk Size

Compression

Gerar documentação.

---

# Fase 6 — Descoberta da Arquitetura

Determinar:

Como o modelo é escolhido.

Como o provider é escolhido.

Como o Agent chama o backend.

Onde ficam as configurações.

Se existe sistema de plugins.

Se existe Dependency Injection.

Se existe Provider Registry.

---

# Fase 7 — Modelo de Extensão

Caso exista arquitetura extensível:

Implementar um novo Provider.

Caso não exista:

Projetar uma camada intermediária.

---

# Fase 8 — Projeto do Bridge

Criar um processo local.

Nome:

```
ag-provider
```

Função:

Receber requisições do IDE.

Converter.

Enviar ao backend escolhido.

Receber resposta.

Traduzir.

Responder ao IDE.

---

# Interface

```
IDE

↓

Bridge

↓

Adapter

↓

Provider
```

---

# Adapters

Criar interface:

```
ILLMProvider

Initialize()

ListModels()

Chat()

Embeddings()

Vision()

Completion()

Stream()

Cancel()

Health()

Capabilities()
```

---

# Implementações

Criar adapters para:

OpenRouter

Ollama

LM Studio

llama.cpp

vLLM

SiliconFlow

Groq

Together

Fireworks

OpenAI

DeepSeek

Kimi

Qwen

GLM

---

# Configuração

Criar:

```
providers.json
```

Exemplo:

```json
{
  "default": "qwen",
  "providers": [
    {
      "id": "qwen",
      "baseUrl": "https://...",
      "apiKey": "..."
    }
  ]
}
```

---

# Recursos desejados

Troca dinâmica de modelo.

Fallback automático.

Retry.

Load Balance.

Model Alias.

Cache.

Context Cache.

Prompt Cache.

Streaming.

Logs.

Métricas.

Health Check.

---

# Interface

Criar painel local.

Mostrar:

Modelo ativo.

Latência.

Tokens.

Provider.

Uso de memória.

Troca de modelo.

Teste de conexão.

---

# Testes

Executar testes para:

Qwen

Kimi

DeepSeek

OpenRouter

Ollama

LM Studio

SiliconFlow

---

# Benchmarks

Comparar:

Tempo de resposta.

Streaming.

Uso de RAM.

Uso de CPU.

Latência.

Tokens/s.

---

# Relatórios

Gerar automaticamente:

```
architecture.md

providers.md

network.md

bridge.md

findings.md

todo.md

roadmap.md
```

---

# Entregáveis

- Código-fonte documentado.
- Diagrama completo da arquitetura.
- Bridge funcional.
- Sistema de adapters.
- Configuração por JSON.
- Testes automatizados.
- Benchmarks.
- Documentação técnica.

---

> **"Antes de implementar qualquer alteração, esgote todas as possibilidades de configuração, extensões, plugins e APIs públicas existentes do Antigravity IDE. Só proponha uma camada de adaptação quando não houver um mecanismo oficial ou documentado que atenda ao objetivo."**

Isso faz o agente procurar primeiro a solução mais limpa e sustentável, e só partir para uma adaptação mais profunda se realmente for necessário.

[1]: https://codelabs.developers.google.com/getting-started-agy-ide?hl=pt-br&utm_source=chatgpt.com "Introdução ao IDE do Antigravity  |  Google Codelabs"
