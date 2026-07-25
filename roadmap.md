# Project Roadmap - Antigravity Universal AI Provider

## Phase 1: Architecture & Reverse Engineering (Completed)
- Mapped IDE core binaries, Electron runtime, and ConnectRPC communication.
- Documented Protobuf wire formats, headers, and extension points.
- Produced technical analysis documents (`architecture.md`, `providers.md`, `network.md`, `bridge.md`, `findings.md`).

## Phase 2: Core Bridge Prototype (`ag-provider` v0.1)
- Scaffold TypeScript project for `ag-provider`.
- Build HTTP/2 ConnectRPC server listening locally.
- Implement OpenAI / Ollama / OpenRouter translation layers (`ILLMProvider`).
- Implement `providers.json` configuration loader.

## Phase 3: Advanced Adapter Capabilities (`ag-provider` v0.2)
- Function / Tool Call mapping between Protobuf and OpenAI schema.
- Support Vision (multimodal image content) and code action payload translation.
- Automatic fallback mechanism & retry strategy.
- Implement local telemetry & metrics dashboard (latency, RAM, tokens/sec).

## Phase 4: Benchmarks & Multi-Provider Ecosystem (`ag-provider` v1.0)
- Automated benchmarking suite comparing response times and streaming throughput across providers (Ollama, LM Studio, Qwen, DeepSeek, OpenRouter).
- One-click model switching in dashboard.
- Full verification and documentation package.
