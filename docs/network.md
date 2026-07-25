# Protocol & Communication Engineering - Antigravity Universal AI Provider

## Overview

This document details the transport protocol, headers, message schemas, streaming events, and payload translation requirements for traffic passing between Antigravity IDE and AI inference backends.

---

## 1. Transport Layer & Headers

Antigravity IDE communicates over **HTTP/2** using **ConnectRPC** (gRPC-web / gRPC over HTTP/2) with binary Protocol Buffer serialization (`@bufbuild/protobuf`).

### Key Headers Sent by IDE

```http
POST /google.cloud.conversa.v1.AgentService/StreamGenerateContent HTTP/2
Host: cloudaicompanion.googleapis.com
Content-Type: application/connect+proto (or application/grpc)
User-Agent: Antigravity-IDE/2.1.1 (Electron 39.2.3; Windows NT 10.0)
Authorization: Bearer <OAUTH_TOKEN>
x-cloudaicompanion-trace-id: <TRACE_ID_UUID>
x-goog-api-client: gl-node/22.20.0 connectrpc/2.0.0
```

---

## 2. Request & Response Payload Specs

### ConnectRPC Schema Structure

Requests dispatched by the IDE internal agent (`out/jetskiAgent/main.js`) structure prompt context as structured agent steps:

```protobuf
syntax = "proto3";

package google.cloud.conversa.v1;

message StreamGenerateContentRequest {
  string model = 1;
  repeated Message messages = 2;
  repeated Tool tools = 3;
  GenerationConfig config = 4;
}

message Message {
  string role = 1; // "user", "model", "system", "tool"
  repeated Part parts = 2;
}

message Part {
  oneof content {
    string text = 1;
    FunctionCall function_call = 2;
    FunctionResponse function_response = 3;
    InlineData inline_data = 4; // Vision / File payload
  }
}
```

---

## 3. Streaming & Chunk Instrumentation

- **Protocol**: Server-Sent Events (SSE) / ConnectRPC Streaming frames (`0x00` data frame header with 4-byte length prefix).
- **Chunk Translation**:
  1. `ag-provider` receives incoming ConnectRPC binary payload.
  2. Unpacks Protobuf message into intermediate JSON structure (`ChatCompletionRequest`).
  3. Dispatches HTTP POST to destination OpenAI endpoint (`/v1/chat/completions`) with `stream: true`.
  4. Intercepts SSE chunks (`data: {"choices":[{"delta":{"content":"..."}}]}`).
  5. Wraps text chunks into ConnectRPC Protobuf frames and streams them back to the IDE.

---

## 4. Traffic Instrumentation Setup

To inspect raw wire packets during development:

- Set environment variable `NODE_TLS_REJECT_UNAUTHORIZED=0`.
- Proxy via local instrumentation tool (e.g. `mitmproxy` / Wireshark) listening on `127.0.0.1:8888`.
- Configure `agentHostAddress` setting in Antigravity settings to route local traffic directly through the proxy.
