# Architecture Analysis - Antigravity IDE

## Executive Summary

This document details the software architecture, runtime environment, directory structure, and underlying internal mechanisms of **Antigravity IDE**, produced via non-destructive static analysis and runtime process mapping.

---

## 1. Technology Identification (Fase 1)

| Aspect | Technology / Specification |
| :--- | :--- |
| **Framework** | Electron 39.2.3 (Chromium 134 / V8) |
| **Core Base** | Modified Google Fork of VS Code (`v1.107.0`, Distro `0c7d350c3a9e8639ea238cc996ec4f6dcf1e35cd`) |
| **Runtime** | Node.js `v22.20.0` |
| **Language** | TypeScript / JavaScript (ESM modules), Protobuf |
| **Packaging** | Inno Setup 6 installer (`unins000.exe`), ASAR & packed unpacked node modules |
| **Installation Path** | `C:\Users\lince\AppData\Local\Programs\Antigravity IDE` |
| **Data Directory** | `C:\Users\lince\AppData\Local\.antigravity-ide` |
| **Global Config Directory** | `C:\Users\lince\.gemini\antigravity-ide` |

---

## 2. Directory & Bundle Structure (Fase 2)

```
Antigravity IDE/
├── Antigravity IDE.exe             # Electron Main Binary (210 MB)
├── chrome_100_percent.pak           # Chromium resources
├── resources/
│   └── app/
│       ├── package.json             # Engine manifest & dependency declarations
│       ├── product.json             # Google Antigravity branding & API configuration
│       ├── out/
│       │   ├── main.js              # Electron Main Process entry point (13 MB)
│       │   ├── cli.js               # Command line launcher
│       │   ├── bootstrap-fork.js    # Child process bootstrap
│       │   ├── jetskiAgent/         # Antigravity Agent Core Webpack Bundle
│       │   │   ├── main.js          # Subagent runtime & tool dispatching (12 MB)
│       │   │   └── main.css         # UI Styling
│       │   └── vs/                  # VS Code Core Workbench
│       ├── extensions/              # Built-in extension gallery
│       │   └── antigravity/         # Core Antigravity AI Extension
│       │       ├── dist/extension.js# Extension Host AI logic (1.99 MB)
│       │       └── package.json     # Extension manifest & custom settings
│       └── node_modules/            # Native & bundled dependencies
└── tools/
    └── inno_updater.exe             # Auto-updater binary
```

---

## 3. Dependency Inventory & Key Subsystems

- **Protocol Buffers & ConnectRPC**:
  - `@bufbuild/protobuf` (`^2.2.2`)
  - `@connectrpc/connect` (`^2.0.0`)
  - `@connectrpc/connect-node` (`^2.0.0`)
  - `@connectrpc/connect-web` (`^2.0.0`)
- **Internal Google Codebases**:
  - `@exa/proto-ts` (Google internal agent protocol schemas)
  - `@exa/agent-ui-toolkit` (Agent UI rendering components)
  - `google-auth-library` (`^10.3.0`)
- **State Engine**:
  - Unified State Sync (USS): Centralized topic-based reactive state synchronization system (`uss-agentPreferences`, `uss-userStatus`, `uss-oauth`, `uss-tabPreferences`, `uss-overrideStore`).

---

## 4. Architectural Findings & Extensibility (Fase 6 & 7)

1. **Provider Resolution Loop**:
   - The Agent process (`out/jetskiAgent/main.js`) connects to AI inference services over HTTP/2 using ConnectRPC.
   - Target backend endpoints default to `cloudaicompanion.googleapis.com` or local sidecar binaries.
2. **Native Endpoint Configuration Hook**:
   - Setting key `pa.AGENT_HOST_ADDRESS` (`agentHostAddressSentinelKey` in `uss-agentPreferences`) controls the target host address for agent RPC requests.
3. **Compatibility Strategy**:
   - Rather than binary modification, an official local proxy bridge process `ag-provider` will be registered at `127.0.0.1:<PORT>` via `agentHostAddress`.
   - `ag-provider` intercepts ConnectRPC requests from the IDE and maps them seamlessly to standard OpenAI `v1/chat/completions` API calls.
