/**
 * AG Universal AI — Sidebar Webview View Provider
 *
 * Implements a full-featured, sleek AI assistant sidebar (like Kimi Code, Cline, Cursor, Roo Code)
 * rendered directly inside the Primary Sidebar.
 *
 * Fully compliant with VS Code Webview CSP policies (using addEventListener instead of inline onclick).
 */

import * as vscode from 'vscode';
import type { ProviderManager } from '../providers/provider-manager';
import type { ToolRegistry } from '../tools/tool-registry';
import type { AgentEngine } from '../agent/engine';
import { getAllPresets } from '../providers/provider-registry';
import { buildSystemPrompt, buildSlashCommandPrompt } from '../chat/prompt-builder';

export class AGSidebarWebviewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
  private view?: vscode.WebviewView;
  private disposables: vscode.Disposable[] = [];
  private chatHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [];

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly providerManager: ProviderManager,
    private readonly toolRegistry: ToolRegistry,
    private readonly agentEngine: AgentEngine,
    private readonly outputChannel: vscode.OutputChannel
  ) {
    this.disposables.push(
      this.providerManager.onDidChangeProvider(() => {
        this.postStateUpdate();
      })
    );
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri],
    };

    webviewView.webview.html = this.getHtml();

    webviewView.webview.onDidReceiveMessage(async (message) => {
      this.log(`Webview message received: ${message.command}`);

      switch (message.command) {
        case 'getState':
          this.postStateUpdate();
          break;

        case 'switchProvider':
          if (message.providerId) {
            this.providerManager.setActiveProvider(message.providerId);
            this.postStateUpdate();
          }
          break;

        case 'saveApiKey':
          if (message.providerId && message.apiKey) {
            await this.providerManager.setApiKey(message.providerId, message.apiKey.trim());
            vscode.window.showInformationMessage(`AG AI: API Key saved for ${message.providerId}`);
            this.postStateUpdate();
          }
          break;

        case 'sendPrompt':
          if (message.text) {
            await this.handleUserPrompt(message.text, message.commandType);
          }
          break;

        case 'runAgentTask':
          if (message.text) {
            await this.handleAgentTask(message.text);
          }
          break;

        case 'clearChat':
          this.chatHistory = [];
          this.postMessage({ command: 'clearChat' });
          break;

        case 'openDashboard':
          vscode.commands.executeCommand('ag-universal-ai.showDashboard');
          break;

        case 'applyToEditor':
          if (message.code) {
            this.applyCodeToActiveEditor(message.code);
          }
          break;
      }
    });

    this.postStateUpdate();
  }

  // ─── Backend Prompt Logic ──────────────────────────────────────────────────

  private async handleUserPrompt(text: string, slashCommand?: string): Promise<void> {
    const activeProvider = this.providerManager.getActiveProvider();

    if (!activeProvider) {
      this.postMessage({
        command: 'endStream',
        fullText: '⚠️ **No active AI provider configured.** Please select a provider from the header dropdown.',
      });
      return;
    }

    this.chatHistory.push({ role: 'user', content: text });

    const systemPrompt = slashCommand
      ? buildSlashCommandPrompt(slashCommand)
      : buildSystemPrompt();

    let contextMessage = '';
    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor) {
      const relPath = vscode.workspace.asRelativePath(activeEditor.document.uri);
      const selText = activeEditor.document.getText(activeEditor.selection);
      if (selText.trim().length > 0) {
        contextMessage = `\nContext File: ${relPath} (Selected Code):\n\`\`\`${activeEditor.document.languageId}\n${selText}\n\`\`\``;
      } else {
        const fileText = activeEditor.document.getText();
        if (fileText.length < 4000) {
          contextMessage = `\nContext File: ${relPath}:\n\`\`\`${activeEditor.document.languageId}\n${fileText}\n\`\`\``;
        }
      }
    }

    const messages = [
      { role: 'system' as const, content: systemPrompt },
      ...this.chatHistory.slice(-6).map((m) => ({ role: m.role, content: m.content })),
    ];

    if (contextMessage) {
      messages[messages.length - 1].content += contextMessage;
    }

    this.postMessage({ command: 'startStream' });

    let fullResponse = '';
    const usedProvider = activeProvider;

    try {
      this.log(`Streaming prompt with provider: ${usedProvider.name} (${usedProvider.config.model})`);

      const stream = usedProvider.stream({
        model: usedProvider.config.model,
        messages,
        temperature: 0.7,
        stream: true,
      });

      for await (const chunk of stream) {
        fullResponse += chunk;
        this.postMessage({ command: 'streamChunk', chunk });
      }

      this.chatHistory.push({ role: 'assistant', content: fullResponse });
      this.postMessage({ command: 'endStream', fullText: fullResponse });
    } catch (primaryErr: unknown) {
      const primaryMsg = primaryErr instanceof Error ? primaryErr.message : String(primaryErr);
      this.log(`Primary provider (${usedProvider.id}) failed: ${primaryMsg}`);

      // Automatic fallback to Groq or Ollama
      const fallbackProvider =
        usedProvider.id !== 'groq'
          ? this.providerManager.getProvider('groq')
          : this.providerManager.getProvider('ollama-local');

      if (fallbackProvider && fallbackProvider.id !== usedProvider.id) {
        this.log(`Fallback to ${fallbackProvider.name}...`);
        this.postMessage({
          command: 'streamChunk',
          chunk: `⚠️ *[${usedProvider.name} failed (${primaryMsg}). Falling back to ${fallbackProvider.name}...]*\n\n`,
        });

        try {
          const fallbackStream = fallbackProvider.stream({
            model: fallbackProvider.config.model,
            messages,
            temperature: 0.7,
            stream: true,
          });

          for await (const chunk of fallbackStream) {
            fullResponse += chunk;
            this.postMessage({ command: 'streamChunk', chunk });
          }

          this.chatHistory.push({ role: 'assistant', content: fullResponse });
          this.postMessage({ command: 'endStream', fullText: fullResponse });
          return;
        } catch (fallbackErr: unknown) {
          const fallbackMsg = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
          this.log(`Fallback failed: ${fallbackMsg}`);
        }
      }

      this.postMessage({
        command: 'endStream',
        fullText: `❌ **Provider Error (${usedProvider.name}):** ${primaryMsg}\n\n💡 *Tip: Switch to **Groq (Llama 3.3 70B)** in the dropdown for instant fast responses.*`,
      });
    }
  }

  private async handleAgentTask(goal: string): Promise<void> {
    this.postMessage({ command: 'addMessage', role: 'user', content: `🤖 **Agent Task:** ${goal}` });
    this.postMessage({ command: 'startStream' });

    try {
      const result = await this.agentEngine.run(
        goal,
        'You are AG Universal AI Agent. Use your available tools to accomplish the user goal.'
      );

      const summary = `\n\n✅ **Agent Task Completed** (${result.iterations} iterations, ${result.toolCalls.length} tool actions).\n\n${result.response}`;
      this.postMessage({ command: 'endStream', fullText: summary });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.postMessage({ command: 'endStream', fullText: `❌ **Agent Error:** ${msg}` });
    }
  }

  private applyCodeToActiveEditor(code: string): void {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showWarningMessage('No active editor open.');
      return;
    }

    editor.edit((editBuilder) => {
      if (!editor.selection.isEmpty) {
        editBuilder.replace(editor.selection, code);
      } else {
        const fullRange = new vscode.Range(
          editor.document.positionAt(0),
          editor.document.positionAt(editor.document.getText().length)
        );
        editBuilder.replace(fullRange, code);
      }
    });

    vscode.window.showInformationMessage('Code applied to active editor!');
  }

  private postStateUpdate(): void {
    const activeProvider = this.providerManager.getActiveProvider();
    const presets = getAllPresets();

    this.postMessage({
      command: 'stateUpdate',
      activeId: this.providerManager.getActiveProviderId() || 'groq',
      activeProvider: activeProvider
        ? {
            id: activeProvider.id,
            name: activeProvider.name,
            model: activeProvider.config.model,
            baseUrl: activeProvider.config.baseUrl,
            hasKey: Boolean(activeProvider.config.apiKey),
          }
        : null,
      providers: presets.map((p) => ({
        id: p.id,
        name: p.name,
        isLocal: p.isLocal,
        requiresApiKey: p.requiresApiKey,
        defaultModel: p.defaultModel,
      })),
    });
  }

  private postMessage(msg: any): void {
    if (this.view) {
      this.view.webview.postMessage(msg);
    }
  }

  private log(message: string): void {
    this.outputChannel.appendLine(`[SidebarWebview] ${message}`);
  }

  public dispose(): void {
    for (const d of this.disposables) {
      d.dispose();
    }
  }

  // ─── HTML/CSS/JS Template ───────────────────────────────────────────────────

  private getHtml(): string {
    const activeId = this.providerManager.getActiveProviderId() || 'groq';
    const presets = getAllPresets();
    const optionsHtml = presets
      .map(
        (p) =>
          `<option value="${p.id}" ${p.id === activeId ? 'selected' : ''}>${
            p.id === activeId ? '⭐ ' : ''
          }${p.name}${p.isLocal ? ' (Local)' : ''}</option>`
      )
      .join('\n');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AG Universal AI</title>
  <style>
    :root {
      --bg: var(--vscode-sideBar-background, #1e1e1e);
      --fg: var(--vscode-sideBar-foreground, #cccccc);
      --border: var(--vscode-widget-border, #333333);
      --accent: var(--vscode-button-background, #007acc);
      --accent-hover: var(--vscode-button-hoverBackground, #005999);
      --input-bg: var(--vscode-input-background, #252526);
      --input-fg: var(--vscode-input-foreground, #cccccc);
      --card-bg: var(--vscode-editor-background, #141414);
      --user-msg-bg: rgba(0, 122, 204, 0.15);
      --ai-msg-bg: rgba(255, 255, 255, 0.04);
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
      font-size: 13px;
      color: var(--fg);
      background-color: var(--bg);
      display: flex;
      flex-direction: column;
      height: 100vh;
      overflow: hidden;
    }

    /* Header Controls */
    .header {
      padding: 12px;
      border-bottom: 1px solid var(--border);
      background: var(--bg);
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .brand-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .brand-title {
      font-weight: 700;
      font-size: 13px;
      display: flex;
      align-items: center;
      gap: 6px;
      color: #fff;
    }

    .badge-status {
      font-size: 10px;
      padding: 2px 6px;
      border-radius: 10px;
      background: rgba(76, 175, 80, 0.2);
      color: #4caf50;
      font-weight: 600;
    }

    .header-actions {
      display: flex;
      gap: 6px;
    }

    .icon-btn {
      background: transparent;
      border: 1px solid var(--border);
      color: var(--fg);
      padding: 4px 8px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
      transition: all 0.2s;
    }

    .icon-btn:hover {
      background: rgba(255, 255, 255, 0.1);
      border-color: var(--accent);
    }

    .select-box {
      width: 100%;
      background: var(--input-bg);
      color: var(--input-fg);
      border: 1px solid var(--border);
      padding: 6px 8px;
      border-radius: 4px;
      font-size: 12px;
      outline: none;
    }

    .select-box:focus {
      border-color: var(--accent);
    }

    /* Key Setup Bar */
    .key-bar {
      display: flex;
      gap: 6px;
      margin-top: 4px;
    }

    .key-input {
      flex: 1;
      background: var(--input-bg);
      color: var(--input-fg);
      border: 1px solid var(--border);
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 11px;
    }

    /* Slash Chips */
    .chips-row {
      display: flex;
      gap: 4px;
      overflow-x: auto;
      padding: 6px 12px;
      border-bottom: 1px solid var(--border);
      background: rgba(0, 0, 0, 0.2);
      scrollbar-width: none;
    }

    .chip {
      white-space: nowrap;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid var(--border);
      color: var(--fg);
      padding: 3px 8px;
      border-radius: 12px;
      font-size: 11px;
      cursor: pointer;
      transition: all 0.2s;
    }

    .chip:hover {
      background: var(--accent);
      color: #fff;
      border-color: var(--accent);
    }

    /* Chat Messages Area */
    .chat-container {
      flex: 1;
      overflow-y: auto;
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .message {
      padding: 10px 12px;
      border-radius: 8px;
      line-height: 1.5;
      font-size: 12.5px;
      max-width: 100%;
      word-wrap: break-word;
      animation: fadeIn 0.2s ease-in-out;
    }

    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(4px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .message.user {
      background: var(--user-msg-bg);
      border: 1px solid rgba(0, 122, 204, 0.3);
      align-self: flex-end;
    }

    .message.assistant {
      background: var(--ai-msg-bg);
      border: 1px solid var(--border);
      align-self: flex-start;
    }

    /* Code Block Formatting */
    pre {
      background: #0d0d0d;
      border: 1px solid #2a2a2a;
      border-radius: 6px;
      padding: 10px;
      margin: 8px 0;
      overflow-x: auto;
      position: relative;
    }

    code {
      font-family: var(--vscode-editor-font-family, 'Consolas', 'Courier New', monospace);
      font-size: 11.5px;
    }

    .code-actions {
      display: flex;
      gap: 6px;
      justify-content: flex-end;
      margin-top: 6px;
    }

    .code-btn {
      background: #222;
      border: 1px solid #444;
      color: #ccc;
      padding: 3px 8px;
      border-radius: 4px;
      font-size: 10.5px;
      cursor: pointer;
    }

    .code-btn:hover {
      background: var(--accent);
      color: #fff;
    }

    /* Input Footer */
    .input-footer {
      padding: 12px;
      border-top: 1px solid var(--border);
      background: var(--bg);
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .input-wrapper {
      display: flex;
      gap: 6px;
      position: relative;
    }

    .prompt-textarea {
      flex: 1;
      background: var(--input-bg);
      color: var(--input-fg);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 8px;
      font-size: 12px;
      resize: none;
      height: 60px;
      font-family: inherit;
      outline: none;
    }

    .prompt-textarea:focus {
      border-color: var(--accent);
    }

    .send-btn {
      background: var(--accent);
      color: #fff;
      border: none;
      border-radius: 6px;
      padding: 0 14px;
      cursor: pointer;
      font-weight: 600;
      transition: background 0.2s;
    }

    .send-btn:hover {
      background: var(--accent-hover);
    }

    .agent-toggle {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 11px;
      color: #aaa;
    }
  </style>
</head>
<body>

  <!-- Header Section -->
  <div class="header">
    <div class="brand-row">
      <div class="brand-title">
        <span>🤖 AG UNIVERSAL AI</span>
        <span class="badge-status" id="statusBadge">ONLINE</span>
      </div>
      <div class="header-actions">
        <button class="icon-btn" id="clearBtn" title="Clear Chat">🧹</button>
        <button class="icon-btn" id="dashboardBtn" title="Metrics Dashboard">📊</button>
      </div>
    </div>

    <!-- Provider Dropdown -->
    <select id="providerSelect" class="select-box">
      ${optionsHtml}
    </select>

    <!-- Key Input Bar -->
    <div class="key-bar" id="keyBar" style="display: none;">
      <input type="password" id="keyInput" class="key-input" placeholder="Paste API Key here..." />
      <button class="icon-btn" id="saveKeyBtn">Save Key</button>
    </div>
  </div>

  <!-- Slash Command Quick Chips -->
  <div class="chips-row">
    <div class="chip" data-cmd="/explain">/explain</div>
    <div class="chip" data-cmd="/refactor">/refactor</div>
    <div class="chip" data-cmd="/test">/test</div>
    <div class="chip" data-cmd="/fix">/fix</div>
    <div class="chip" data-cmd="/docs">/docs</div>
    <div class="chip" data-cmd="/review">/review</div>
    <div class="chip" data-cmd="🤖 Agent Task: ">🤖 Agent</div>
  </div>

  <!-- Chat History Area -->
  <div class="chat-container" id="chatContainer">
    <div class="message assistant">
      👋 Welcome to <strong>AG Universal AI</strong>! Select your provider (Groq, Qwen 3.8 2.4T, Kimi K3, OpenRouter, Ollama) and start coding.
    </div>
  </div>

  <!-- Input Footer Area -->
  <div class="input-footer">
    <div class="input-wrapper">
      <textarea id="promptInput" class="prompt-textarea" placeholder="Ask AG AI or type a command..."></textarea>
      <button id="sendBtn" class="send-btn">Send</button>
    </div>
    <div class="agent-toggle">
      <input type="checkbox" id="agentMode" />
      <label for="agentMode">Plan-Then-Act Agent Mode (Executes Tools)</label>
    </div>
  </div>

  <script>
    (function() {
      const vscode = acquireVsCodeApi();
      let currentStreamDiv = null;

      // Register DOM Event Listeners (CSP compliant - no inline onclicks)
      document.addEventListener('DOMContentLoaded', () => {
        setupEventListeners();
      });

      // Also setup immediately in case DOMContentLoaded already fired
      if (document.readyState === 'interactive' || document.readyState === 'complete') {
        setupEventListeners();
      }

      function setupEventListeners() {
        const sendBtn = document.getElementById('sendBtn');
        if (sendBtn && !sendBtn.dataset.bound) {
          sendBtn.dataset.bound = 'true';
          sendBtn.addEventListener('click', sendPrompt);
        }

        const promptInput = document.getElementById('promptInput');
        if (promptInput && !promptInput.dataset.bound) {
          promptInput.dataset.bound = 'true';
          promptInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              sendPrompt();
            }
          });
        }

        const clearBtn = document.getElementById('clearBtn');
        if (clearBtn && !clearBtn.dataset.bound) {
          clearBtn.dataset.bound = 'true';
          clearBtn.addEventListener('click', () => {
            vscode.postMessage({ command: 'clearChat' });
          });
        }

        const dashboardBtn = document.getElementById('dashboardBtn');
        if (dashboardBtn && !dashboardBtn.dataset.bound) {
          dashboardBtn.dataset.bound = 'true';
          dashboardBtn.addEventListener('click', () => {
            vscode.postMessage({ command: 'openDashboard' });
          });
        }

        const saveKeyBtn = document.getElementById('saveKeyBtn');
        if (saveKeyBtn && !saveKeyBtn.dataset.bound) {
          saveKeyBtn.dataset.bound = 'true';
          saveKeyBtn.addEventListener('click', saveApiKey);
        }

        const providerSelect = document.getElementById('providerSelect');
        if (providerSelect && !providerSelect.dataset.bound) {
          providerSelect.dataset.bound = 'true';
          providerSelect.addEventListener('change', (e) => {
            vscode.postMessage({ command: 'switchProvider', providerId: e.target.value });
          });
        }

        // Chip click delegation
        document.querySelectorAll('.chip').forEach(chip => {
          if (!chip.dataset.bound) {
            chip.dataset.bound = 'true';
            chip.addEventListener('click', () => {
              const cmd = chip.getAttribute('data-cmd');
              if (cmd && promptInput) {
                promptInput.value = cmd + ' ';
                promptInput.focus();
              }
            });
          }
        });

        // Code button click delegation
        document.addEventListener('click', (e) => {
          if (e.target && e.target.classList.contains('code-btn')) {
            const codeEl = e.target.closest('pre')?.querySelector('code');
            if (codeEl) {
              vscode.postMessage({ command: 'applyToEditor', code: codeEl.innerText });
            }
          }
        });

        // Sync initial state
        setTimeout(() => {
          vscode.postMessage({ command: 'getState' });
        }, 100);
      }

      // Handle incoming messages from Extension Backend
      window.addEventListener('message', event => {
        const msg = event.data;
        switch (msg.command) {
          case 'stateUpdate':
            renderState(msg);
            break;
          case 'addMessage':
            appendMessage(msg.role, msg.content);
            break;
          case 'startStream':
            if (!currentStreamDiv) {
              currentStreamDiv = appendMessage('assistant', '⏳ *Thinking...*');
            }
            break;
          case 'streamChunk':
            if (currentStreamDiv) {
              if (currentStreamDiv.innerHTML.includes('Thinking...')) {
                currentStreamDiv.innerHTML = '';
              }
              currentStreamDiv.innerHTML += formatText(msg.chunk);
              scrollToBottom();
            }
            break;
          case 'endStream':
            if (currentStreamDiv) {
              currentStreamDiv.innerHTML = formatMarkdown(msg.fullText);
              currentStreamDiv = null;
              scrollToBottom();
            }
            break;
          case 'clearChat':
            document.getElementById('chatContainer').innerHTML = '';
            break;
        }
      });

      function renderState(state) {
        const select = document.getElementById('providerSelect');
        if (select && state.providers) {
          select.innerHTML = '';
          state.providers.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.id;
            opt.textContent = (p.id === state.activeId ? '⭐ ' : '') + p.name + (p.isLocal ? ' (Local)' : '');
            if (p.id === state.activeId) opt.selected = true;
            select.appendChild(opt);
          });
        }

        const keyBar = document.getElementById('keyBar');
        if (keyBar) {
          if (state.activeProvider && !state.activeProvider.hasKey && !state.activeProvider.baseUrl.includes('localhost')) {
            keyBar.style.display = 'flex';
          } else {
            keyBar.style.display = 'none';
          }
        }
      }

      function saveApiKey() {
        const keyInput = document.getElementById('keyInput');
        const select = document.getElementById('providerSelect');
        if (keyInput && keyInput.value && select) {
          vscode.postMessage({ command: 'saveApiKey', providerId: select.value, apiKey: keyInput.value });
          keyInput.value = '';
        }
      }

      function sendPrompt() {
        const input = document.getElementById('promptInput');
        if (!input) return;
        const text = input.value.trim();
        if (!text) return;

        // Render user message and thinking indicator immediately
        appendMessage('user', text);
        currentStreamDiv = appendMessage('assistant', '⏳ *Thinking...*');

        const isAgentEl = document.getElementById('agentMode');
        const isAgent = isAgentEl ? isAgentEl.checked : false;

        if (isAgent) {
          vscode.postMessage({ command: 'runAgentTask', text: text });
        } else {
          let commandType = undefined;
          if (text.startsWith('/')) {
            commandType = text.split(' ')[0].substring(1);
          }
          vscode.postMessage({ command: 'sendPrompt', text: text, commandType: commandType });
        }

        input.value = '';
      }

      function appendMessage(role, text) {
        const container = document.getElementById('chatContainer');
        if (!container) return null;
        const div = document.createElement('div');
        div.className = 'message ' + role;
        div.innerHTML = formatMarkdown(text);
        container.appendChild(div);
        scrollToBottom();
        return div;
      }

      function formatText(str) {
        if (!str) return '';
        return str.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br/>');
      }

      function formatMarkdown(text) {
        if (!text) return '';
        let html = text.replace(/\`\`\`(\w*)\n([\s\S]*?)\`\`\`/g, function(match, lang, code) {
          const cleanCode = code.replace(/</g, '&lt;').replace(/>/g, '&gt;');
          return '<pre><code>' + cleanCode + '</code><div class="code-actions"><button class="code-btn">Apply to Editor</button></div></pre>';
        });
        html = html.replace(/\`([^\`]+)\`/g, '<code>$1</code>');
        html = html.replace(/\n/g, '<br/>');
        return html;
      }

      function scrollToBottom() {
        const container = document.getElementById('chatContainer');
        if (container) {
          container.scrollTop = container.scrollHeight;
        }
      }
    })();
  </script>
</body>
</html>`;
  }
}
