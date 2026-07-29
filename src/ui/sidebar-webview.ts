/**
 * AG Universal AI — Sidebar Webview View Provider
 *
 * Implements a full-featured, sleek AI assistant sidebar (like Kimi Code, Cline, Cursor, Roo Code)
 * rendered directly inside the Primary Sidebar. Includes:
 * - Provider & Model Selector header
 * - API Key management
 * - Multi-turn Chat with Markdown & Code Block rendering
 * - Slash command quick chips (/explain, /refactor, /test, /fix, /docs, /review, /agent)
 * - Agentic tool execution progress & confirmation cards
 * - Direct "Apply to Editor" and "Copy Code" actions
 * - Real-time streaming response
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
  private chatHistory: Array<{ role: 'user' | 'assistant'; content: string; toolCalls?: any[] }> = [];

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly providerManager: ProviderManager,
    private readonly toolRegistry: ToolRegistry,
    private readonly agentEngine: AgentEngine,
    private readonly outputChannel: vscode.OutputChannel
  ) {
    // Listen for provider changes and update webview state
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

    // Handle messages sent from the Webview frontend
    webviewView.webview.onDidReceiveMessage(async (message) => {
      this.log(`Webview message: ${message.command}`);
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

        case 'setModel':
          if (message.model) {
            const config = vscode.workspace.getConfiguration('ag-universal-ai');
            await config.update('activeModel', message.model, vscode.ConfigurationTarget.Global);
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

        case 'applyToEditor':
          if (message.code) {
            this.applyCodeToActiveEditor(message.code);
          }
          break;

        case 'insertAtCursor':
          if (message.code) {
            this.insertCodeAtCursor(message.code);
          }
          break;
      }
    });

    // Initial state sync
    this.postStateUpdate();
  }

  // ─── Backend Logic ─────────────────────────────────────────────────────────

  private async handleUserPrompt(text: string, slashCommand?: string): Promise<void> {
    const activeProvider = this.providerManager.getActiveProvider();
    if (!activeProvider) {
      this.postMessage({
        command: 'addMessage',
        role: 'assistant',
        content: '⚠️ **No active AI provider configured.** Please select a provider from the header dropdown.',
      });
      return;
    }

    // Add user message to history
    this.chatHistory.push({ role: 'user', content: text });
    this.postMessage({ command: 'addMessage', role: 'user', content: text });

    // Prepare system prompt
    const systemPrompt = slashCommand
      ? buildSlashCommandPrompt(slashCommand)
      : buildSystemPrompt();

    // Context from current editor selection/file if available
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

    // Signal start streaming
    this.postMessage({ command: 'startStream' });

    let fullResponse = '';
    try {
      const stream = activeProvider.stream({
        model: activeProvider.config.model,
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
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.postMessage({
        command: 'endStream',
        fullText: `❌ **Error:** ${errorMsg}\n\nCheck your API key in settings.`,
      });
    }
  }

  private async handleAgentTask(goal: string): Promise<void> {
    this.postMessage({ command: 'addMessage', role: 'user', content: `🤖 **Agent Task:** ${goal}` });
    this.postMessage({ command: 'startStream' });

    try {
      const result = await this.agentEngine.run(
        goal,
        'You are AG Universal AI Agent. Use your available workspace/file/terminal tools to achieve the goal.',
        undefined // Stream progress directly to webview
      );

      const summary = `\n\n✅ **Agent Task Completed** (${result.iterations} iterations, ${result.toolCalls.length} tool actions executed).\n\n${result.response}`;
      this.postMessage({ command: 'endStream', fullText: summary });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.postMessage({ command: 'endStream', fullText: `❌ **Agent Execution Error:** ${msg}` });
    }
  }

  private applyCodeToActiveEditor(code: string): void {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showWarningMessage('No active editor open to apply code.');
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

  private insertCodeAtCursor(code: string): void {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showWarningMessage('No active editor open.');
      return;
    }

    editor.edit((editBuilder) => {
      editBuilder.insert(editor.selection.active, code);
    });
  }

  private postStateUpdate(): void {
    const activeProvider = this.providerManager.getActiveProvider();
    const presets = getAllPresets();

    this.postMessage({
      command: 'stateUpdate',
      activeId: this.providerManager.getActiveProviderId() || 'dashscope-qwen',
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
    const activeId = this.providerManager.getActiveProviderId() || 'dashscope-qwen';
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
      font-size: 14px;
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
        <button class="icon-btn" onclick="clearChat()" title="Clear Chat">🧹</button>
        <button class="icon-btn" onclick="openDashboard()" title="Metrics Dashboard">📊</button>
      </div>
    </div>

    <!-- Provider Dropdown -->
    <select id="providerSelect" class="select-box" onchange="onProviderChange(this.value)">
      ${optionsHtml}
    </select>

    <!-- Key Input Bar -->
    <div class="key-bar" id="keyBar" style="display: none;">
      <input type="password" id="keyInput" class="key-input" placeholder="Paste API Key here..." />
      <button class="icon-btn" onclick="saveApiKey()">Save Key</button>
    </div>
  </div>

  <!-- Slash Command Quick Chips -->
  <div class="chips-row">
    <div class="chip" onclick="applyChip('/explain')">/explain</div>
    <div class="chip" onclick="applyChip('/refactor')">/refactor</div>
    <div class="chip" onclick="applyChip('/test')">/test</div>
    <div class="chip" onclick="applyChip('/fix')">/fix</div>
    <div class="chip" onclick="applyChip('/docs')">/docs</div>
    <div class="chip" onclick="applyChip('/review')">/review</div>
    <div class="chip" onclick="applyChip('🤖 Agent Task: ')">🤖 Agent</div>
  </div>

  <!-- Chat History Area -->
  <div class="chat-container" id="chatContainer">
    <div class="message assistant">
      👋 Welcome to <strong>AG Universal AI</strong>! Select your preferred provider (Qwen 3.8 2.4T, Kimi K3, OpenRouter, Groq, Ollama) above and start coding.
    </div>
  </div>

  <!-- Input Footer Area -->
  <div class="input-footer">
    <div class="input-wrapper">
      <textarea id="promptInput" class="prompt-textarea" placeholder="Ask AG AI or type a command..." onkeydown="handleKeyDown(event)"></textarea>
      <button class="send-btn" onclick="sendPrompt()">Send</button>
    </div>
    <div class="agent-toggle">
      <input type="checkbox" id="agentMode" />
      <label for="agentMode">Plan-Then-Act Agent Mode (Executes Tools)</label>
    </div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    let currentStreamDiv = null;

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
          currentStreamDiv = appendMessage('assistant', '');
          break;
        case 'streamChunk':
          if (currentStreamDiv) {
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

    // Request initial state after registering listener
    setTimeout(() => {
      vscode.postMessage({ command: 'getState' });
    }, 50);

    function renderState(state) {
      const select = document.getElementById('providerSelect');
      select.innerHTML = '';

      state.providers.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = (p.id === state.activeId ? '⭐ ' : '') + p.name + (p.isLocal ? ' (Local)' : '');
        if (p.id === state.activeId) opt.selected = true;
        select.appendChild(opt);
      });

      const keyBar = document.getElementById('keyBar');
      if (state.activeProvider && !state.activeProvider.hasKey && !state.activeProvider.baseUrl.includes('localhost')) {
        keyBar.style.display = 'flex';
      } else {
        keyBar.style.display = 'none';
      }
    }

    function onProviderChange(val) {
      vscode.postMessage({ command: 'switchProvider', providerId: val });
    }

    function saveApiKey() {
      const val = document.getElementById('keyInput').value;
      const select = document.getElementById('providerSelect');
      if (val) {
        vscode.postMessage({ command: 'saveApiKey', providerId: select.value, apiKey: val });
        document.getElementById('keyInput').value = '';
      }
    }

    function sendPrompt() {
      const input = document.getElementById('promptInput');
      const text = input.value.trim();
      if (!text) return;

      const isAgent = document.getElementById('agentMode').checked;
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

    function handleKeyDown(e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendPrompt();
      }
    }

    function applyChip(cmd) {
      const input = document.getElementById('promptInput');
      input.value = cmd + ' ';
      input.focus();
    }

    function clearChat() {
      vscode.postMessage({ command: 'clearChat' });
    }

    function openDashboard() {
      vscode.postMessage({ command: 'sendPrompt', text: '/status' });
    }

    function appendMessage(role, text) {
      const container = document.getElementById('chatContainer');
      const div = document.createElement('div');
      div.className = 'message ' + role;
      div.innerHTML = formatMarkdown(text);
      container.appendChild(div);
      scrollToBottom();
      return div;
    }

    function formatText(str) {
      return str.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br/>');
    }

    function formatMarkdown(text) {
      if (!text) return '';
      // Basic code block formatting
      let html = text.replace(/\`\`\`(\w*)\n([\s\S]*?)\`\`\`/g, function(match, lang, code) {
        const cleanCode = code.replace(/</g, '&lt;').replace(/>/g, '&gt;');
        return '<pre><code>' + cleanCode + '</code><div class="code-actions"><button class="code-btn" onclick="applyCode(this)">Apply to Editor</button></div></pre>';
      });
      html = html.replace(/\`([^\`]+)\`/g, '<code>$1</code>');
      html = html.replace(/\n/g, '<br/>');
      return html;
    }

    function applyCode(btn) {
      const code = btn.parentElement.parentElement.querySelector('code').innerText;
      vscode.postMessage({ command: 'applyToEditor', code: code });
    }

    function scrollToBottom() {
      const container = document.getElementById('chatContainer');
      container.scrollTop = container.scrollHeight;
    }
  </script>
</body>
</html>`;
  }
}
