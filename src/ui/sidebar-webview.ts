/**
 * AG Universal AI — Sidebar Webview View Provider
 *
 * Uses VS Code nonce-based CSP for script execution.
 * All event handling via addEventListener (CSP compliant).
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
      this.providerManager.onDidChangeProvider(() => this.postStateUpdate())
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

    webviewView.webview.html = this.getHtml(webviewView.webview);

    // Re-hydrate state when webview becomes visible
    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) {
        this.postStateUpdate();
      }
    });

    webviewView.onDidDispose(() => {
      this.view = undefined;
    });

    webviewView.webview.onDidReceiveMessage(async (msg) => {
      this.log(`MSG IN: ${msg.type}`);
      try {
        switch (msg.type) {
          case 'ready':
            this.postStateUpdate();
            break;
          case 'switchProvider':
            await this.providerManager.setActiveProvider(msg.id);
            break;
          case 'switchModel':
            if (msg.model && this.providerManager.getActiveProviderId()) {
              await this.providerManager.setModel(this.providerManager.getActiveProviderId()!, msg.model);
            }
            break;
          case 'saveKey':
            await this.providerManager.setApiKey(msg.id, msg.key.trim());
            vscode.window.showInformationMessage(`API Key saved for ${msg.id}`);
            await this.postStateUpdate();
            break;
          case 'chat':
            await this.handleChat(msg.text, msg.slash);
            break;
          case 'agent':
            await this.handleAgent(msg.text);
            break;
          case 'clear':
            this.chatHistory = [];
            this.post({ type: 'cleared' });
            break;
          case 'dashboard':
            vscode.commands.executeCommand('ag-universal-ai.showDashboard');
            break;
          case 'apply':
            this.applyCode(msg.code);
            break;
        }
      } catch (err: unknown) {
        const m = err instanceof Error ? err.message : String(err);
        this.log(`ERROR handling ${msg.type}: ${m}`);
        this.post({ type: 'error', text: m });
      }
    });

    // Hydrate immediately on load
    this.postStateUpdate();
  }

  // ── Chat Handler ──────────────────────────────────────────────────────────

  private async handleChat(text: string, slash?: string): Promise<void> {
    this.chatHistory.push({ role: 'user', content: text });

    const provider = this.providerManager.getActiveProvider();
    if (!provider) {
      this.post({ type: 'done', text: '⚠️ No provider active. Select one from the dropdown.' });
      return;
    }

    const sysPrompt = slash ? buildSlashCommandPrompt(slash) : buildSystemPrompt();

    // Add editor context
    let ctx = '';
    const ed = vscode.window.activeTextEditor;
    if (ed) {
      const rel = vscode.workspace.asRelativePath(ed.document.uri);
      const sel = ed.document.getText(ed.selection);
      if (sel.trim()) {
        ctx = `\nFile: ${rel} (selection):\n\`\`\`${ed.document.languageId}\n${sel}\n\`\`\``;
      } else if (ed.document.getText().length < 4000) {
        ctx = `\nFile: ${rel}:\n\`\`\`${ed.document.languageId}\n${ed.document.getText()}\n\`\`\``;
      }
    }

    const msgs = [
      { role: 'system' as const, content: sysPrompt },
      ...this.chatHistory.slice(-6).map(m => ({ role: m.role, content: m.content })),
    ];
    if (ctx) { msgs[msgs.length - 1].content += ctx; }

    this.log(`Calling ${provider.name} (${provider.config.model})...`);

    const startTime = Date.now();
    const promptChars = msgs.reduce((acc, m) => acc + (typeof m.content === 'string' ? m.content.length : 0), 0);
    const promptTokensEst = Math.ceil(promptChars / 4);

    let full = '';
    try {
      const stream = provider.stream({
        model: provider.config.model,
        messages: msgs,
        temperature: 0.7,
        stream: true,
      });

      for await (const chunk of stream) {
        full += chunk;
        this.post({ type: 'chunk', text: chunk });
      }

      const latencyMs = Date.now() - startTime;
      const completionTokensEst = Math.ceil(full.length / 4);
      this.providerManager.recordMetric({
        providerId: provider.id,
        model: provider.config.model,
        isStream: true,
        promptTokens: promptTokensEst,
        completionTokens: completionTokensEst,
        latencyMs,
        status: 'success',
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.log(`Provider ${provider.id} failed: ${msg}`);

      const latencyMs = Date.now() - startTime;
      this.providerManager.recordMetric({
        providerId: provider.id,
        model: provider.config.model,
        isStream: true,
        promptTokens: promptTokensEst,
        completionTokens: 0,
        latencyMs,
        status: 'error',
        errorMessage: msg,
      });

      // Fallback
      const config = vscode.workspace.getConfiguration('ag-universal-ai');
      const fallbackList = config.get<string[]>('fallbackProviders', []);
      let fbId = fallbackList.find(id => id !== provider.id && this.providerManager.getProvider(id));
      if (!fbId && provider.id !== 'ollama-local' && this.providerManager.getProvider('ollama-local')) {
        fbId = 'ollama-local';
      }

      const fb = fbId ? this.providerManager.getProvider(fbId) : undefined;
      if (fb) {
        this.log(`Falling back to ${fb.name}`);
        this.post({ type: 'chunk', text: `\n⚠️ ${provider.name} failed. Trying ${fb.name}...\n\n` });
        const fbStartTime = Date.now();
        try {
          const s2 = fb.stream({ model: fb.config.model, messages: msgs, temperature: 0.7, stream: true });
          let fbFull = '';
          for await (const c of s2) { fbFull += c; full += c; this.post({ type: 'chunk', text: c }); }

          this.providerManager.recordMetric({
            providerId: fb.id,
            model: fb.config.model,
            isStream: true,
            promptTokens: promptTokensEst,
            completionTokens: Math.ceil(fbFull.length / 4),
            latencyMs: Date.now() - fbStartTime,
            status: 'success',
          });
        } catch (e2: unknown) {
          const m2 = e2 instanceof Error ? e2.message : String(e2);
          full = `❌ ${provider.name}: ${msg}\n❌ ${fb.name}: ${m2}`;
          this.providerManager.recordMetric({
            providerId: fb.id,
            model: fb.config.model,
            isStream: true,
            promptTokens: promptTokensEst,
            completionTokens: 0,
            latencyMs: Date.now() - fbStartTime,
            status: 'error',
            errorMessage: m2,
          });
        }
      } else {
        full = `❌ ${provider.name}: ${msg}`;
      }
    }

    if (full) { this.chatHistory.push({ role: 'assistant', content: full }); }
    this.post({ type: 'done', text: full });
  }

  private async handleAgent(goal: string): Promise<void> {
    const startTime = Date.now();
    const activeProvider = this.providerManager.getActiveProvider();
    const providerId = activeProvider ? activeProvider.id : 'agent';
    const model = activeProvider ? activeProvider.config.model : 'agent-loop';

    try {
      const result = await this.agentEngine.run(goal, 'Use tools to accomplish the goal.');
      const latencyMs = Date.now() - startTime;
      const totalChars = result.response.length;
      this.providerManager.recordMetric({
        providerId,
        model,
        isStream: false,
        promptTokens: Math.ceil(goal.length / 4),
        completionTokens: Math.ceil(totalChars / 4),
        latencyMs,
        status: 'success',
      });
      this.post({ type: 'done', text: `✅ Agent done (${result.iterations} steps, ${result.toolCalls.length} tools)\n\n${result.response}` });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.providerManager.recordMetric({
        providerId,
        model,
        isStream: false,
        promptTokens: Math.ceil(goal.length / 4),
        completionTokens: 0,
        latencyMs: Date.now() - startTime,
        status: 'error',
        errorMessage: msg,
      });
      this.post({ type: 'done', text: `❌ Agent error: ${msg}` });
    }
  }

  private applyCode(code: string): void {
    const ed = vscode.window.activeTextEditor;
    if (!ed) { vscode.window.showWarningMessage('No active editor'); return; }
    ed.edit(b => {
      if (!ed.selection.isEmpty) { b.replace(ed.selection, code); }
      else { b.insert(ed.selection.active, code); }
    });
    vscode.window.showInformationMessage('Code applied!');
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private stateSeq = 0;

  private async postStateUpdate(): Promise<void> {
    const currentSeq = ++this.stateSeq;
    const ap = this.providerManager.getActiveProvider();
    const activeId = this.providerManager.getActiveProviderId() || 'ollama-local';
    const presets = getAllPresets().map(p => ({
      id: p.id,
      name: p.name + (p.isLocal ? ' (Local)' : ''),
      local: p.isLocal,
      needsKey: p.requiresApiKey,
    }));

    // 1. Post immediate state update (optimistic UI response)
    const initialModels = ap?.config.model ? [ap.config.model] : [];
    this.post({
      type: 'state',
      activeId,
      active: ap ? { id: ap.id, name: ap.name, model: ap.config.model, url: ap.config.baseUrl, hasKey: !!ap.config.apiKey } : null,
      models: initialModels,
      providers: presets,
    });

    if (!ap) { return; }

    // 2. Fetch full model list asynchronously
    let models: string[] = [];
    try {
      const modelInfos = await this.providerManager.listModels(ap.id);
      models = modelInfos.map((m) => m.id);
    } catch {
      models = [];
    }

    // 3. Stale check: Drop if a newer state update was triggered
    if (currentSeq !== this.stateSeq) {
      return;
    }

    if (ap.config.model && !models.includes(ap.config.model)) {
      models.unshift(ap.config.model);
    }

    this.post({
      type: 'state',
      activeId,
      active: { id: ap.id, name: ap.name, model: ap.config.model, url: ap.config.baseUrl, hasKey: !!ap.config.apiKey },
      models,
      providers: presets,
    });
  }

  private post(msg: any): void {
    if (this.view) {
      try {
        this.view.webview.postMessage(msg);
      } catch {
        // ignore if webview is disposed
      }
    }
  }

  private log(m: string): void {
    this.outputChannel.appendLine(`[Sidebar] ${m}`);
  }

  public dispose(): void {
    this.disposables.forEach(d => d.dispose());
  }

  // ── HTML Generation ───────────────────────────────────────────────────────

  private getNonce(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let r = '';
    for (let i = 0; i < 32; i++) { r += chars.charAt(Math.floor(Math.random() * chars.length)); }
    return r;
  }

  private getHtml(webview: vscode.Webview): string {
    const nonce = this.getNonce();
    const csp = webview.cspSource;

    const activeId = this.providerManager.getActiveProviderId() || 'groq';
    const opts = getAllPresets().map(p =>
      '<option value="' + p.id + '"' + (p.id === activeId ? ' selected' : '') + '>' +
      (p.id === activeId ? '⭐ ' : '') + p.name + (p.isLocal ? ' (Local)' : '') +
      '</option>'
    ).join('');

    return '<!DOCTYPE html>\n<html lang="en">\n<head>\n' +
      '<meta charset="UTF-8">\n' +
      '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src ' + csp + ' \'unsafe-inline\'; script-src \'nonce-' + nonce + '\';">\n' +
      '<meta name="viewport" content="width=device-width, initial-scale=1.0">\n' +
      '<style>\n' + this.getCss() + '\n</style>\n' +
      '</head>\n<body>\n' +
      this.getBody(opts) +
      '\n<script nonce="' + nonce + '">\n' + this.getScript() + '\n</script>\n' +
      '</body>\n</html>';
  }

  private getCss(): string {
    return `
      :root {
        --bg: var(--vscode-sideBar-background, #18181a);
        --fg: var(--vscode-sideBar-foreground, #cccccc);
        --border: var(--vscode-widget-border, rgba(255, 255, 255, 0.08));
        --card-bg: var(--vscode-input-background, #222225);
        --card-border: rgba(255, 255, 255, 0.12);
        --accent: var(--vscode-button-background, #007acc);
        --accent-hover: var(--vscode-button-hoverBackground, #1177bb);
        --input-fg: var(--vscode-input-foreground, #dddddd);
        --pill-bg: rgba(255, 255, 255, 0.06);
        --pill-hover: rgba(255, 255, 255, 0.12);
        --pill-active: #04395e;
        --pill-active-border: #007acc;
      }
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: var(--vscode-font-family, system-ui, sans-serif); font-size: 12px; color: var(--fg); background: var(--bg); display: flex; flex-direction: column; height: 100vh; overflow: hidden; }

      .hdr { padding: 8px 12px; border-bottom: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; flex-shrink: 0; background: var(--bg); }
      .hdr-row { display: flex; align-items: center; justify-content: space-between; width: 100%; }
      .brand { font-weight: 700; font-size: 11px; letter-spacing: 0.5px; color: #ffffff; display: flex; align-items: center; gap: 6px; }
      .badge { font-size: 8px; padding: 2px 6px; border-radius: 10px; background: rgba(76,175,80,.2); color: #4caf50; font-weight: 700; }
      .hdr-btns { display: flex; gap: 4px; }
      .ibtn { background: transparent; border: 1px solid var(--border); color: var(--fg); padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 12px; transition: background 0.15s ease; }
      .ibtn:hover { background: rgba(255,255,255,.1); }

      #chat { flex: 1; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 10px; }
      .msg { padding: 10px 12px; border-radius: 8px; line-height: 1.45; font-size: 12px; word-wrap: break-word; animation: fi .15s ease; }
      @keyframes fi { from { opacity: 0; transform: translateY(3px); } to { opacity: 1; transform: translateY(0); } }
      .msg.user { background: rgba(0,122,204,.18); border: 1px solid rgba(0,122,204,.35); align-self: flex-end; max-width: 88%; border-bottom-right-radius: 2px; }
      .msg.assistant { background: rgba(255,255,255,.04); border: 1px solid var(--border); align-self: flex-start; max-width: 96%; border-bottom-left-radius: 2px; }
      pre { background: #0d0d0d; border: 1px solid #2a2a2a; border-radius: 6px; padding: 10px; margin: 8px 0; overflow-x: auto; }
      code { font-family: var(--vscode-editor-font-family, monospace); font-size: 11px; }
      .cbtn { background: #222; border: 1px solid #444; color: #ccc; padding: 3px 8px; border-radius: 4px; font-size: 10px; cursor: pointer; margin-top: 6px; display: inline-block; }
      .cbtn:hover { background: var(--accent); color: #fff; }

      .input-card { margin: 8px 10px 10px 10px; background: var(--card-bg); border: 1px solid var(--card-border); border-radius: 10px; padding: 8px 10px; display: flex; flex-direction: column; gap: 6px; flex-shrink: 0; box-shadow: 0 4px 16px rgba(0,0,0,0.25); transition: border-color 0.15s ease; }
      .input-card:focus-within { border-color: var(--accent); }

      .chips { display: flex; gap: 4px; overflow-x: auto; padding-bottom: 4px; scrollbar-width: none; }
      .chips::-webkit-scrollbar { display: none; }
      .chip { white-space: nowrap; background: var(--pill-bg); border: 1px solid var(--border); color: var(--fg); padding: 2px 7px; border-radius: 12px; font-size: 10px; cursor: pointer; font-weight: 500; transition: all 0.15s ease; }
      .chip:hover { background: var(--accent); color: #ffffff; border-color: var(--accent); }

      textarea { width: 100%; background: transparent; color: var(--input-fg); border: none; font-size: 12px; resize: none; min-height: 48px; max-height: 140px; font-family: inherit; outline: none; line-height: 1.4; }

      .card-toolbar { display: flex; align-items: center; justify-content: space-between; padding-top: 6px; border-top: 1px solid rgba(255,255,255,0.06); gap: 6px; }
      .tb-left { display: flex; align-items: center; gap: 6px; flex: 1; min-width: 0; overflow-x: auto; scrollbar-width: none; }
      .tb-left::-webkit-scrollbar { display: none; }

      .pill { display: inline-flex; align-items: center; gap: 4px; background: var(--pill-bg); border: 1px solid var(--border); color: var(--fg); padding: 3px 8px; border-radius: 14px; font-size: 11px; cursor: pointer; user-select: none; transition: all 0.15s ease; white-space: nowrap; }
      .pill:hover { background: var(--pill-hover); border-color: rgba(255,255,255,0.2); }
      .pill.active { background: var(--pill-active); border-color: var(--pill-active-border); color: #ffffff; font-weight: 600; }

      .pill-select { display: inline-flex; align-items: center; gap: 4px; background: var(--pill-bg); border: 1px solid var(--border); padding: 2px 8px; border-radius: 14px; font-size: 11px; position: relative; max-width: 170px; }
      .pill-select:hover { background: var(--pill-hover); border-color: rgba(255,255,255,0.2); }
      .pill-select select { background: transparent; color: var(--fg); border: none; font-size: 11px; outline: none; cursor: pointer; width: 100%; text-overflow: ellipsis; }

      .keybar { display: none; align-items: center; gap: 4px; background: rgba(255,193,7,0.1); border: 1px solid rgba(255,193,7,0.3); padding: 2px 6px; border-radius: 12px; }
      .keybar input { background: transparent; border: none; color: #fff; font-size: 10px; outline: none; width: 90px; }

      .send-pill { background: var(--accent); color: #ffffff; border: none; border-radius: 14px; padding: 4px 12px; cursor: pointer; font-weight: 600; font-size: 11px; display: inline-flex; align-items: center; gap: 4px; transition: background 0.15s ease; flex-shrink: 0; }
      .send-pill:hover { background: var(--accent-hover); }
    `;
  }

  private getBody(optionsHtml: string): string {
    return `
  <div class="hdr">
    <div class="hdr-row">
      <span class="brand">🤖 AG UNIVERSAL AI <span class="badge">ONLINE</span></span>
      <div class="hdr-btns">
        <button class="ibtn" id="btnClear" title="Clear Chat">🧹</button>
        <button class="ibtn" id="btnDash" title="Dashboard">📊</button>
      </div>
    </div>
  </div>

  <div id="chat">
    <div class="msg assistant">👋 Welcome to <b>AG Universal AI</b>! Describe what to build or ask AI.</div>
  </div>

  <div class="input-card">
    <div class="chips" id="chips">
      <span class="chip" data-c="/explain ">/explain</span>
      <span class="chip" data-c="/refactor ">/refactor</span>
      <span class="chip" data-c="/test ">/test</span>
      <span class="chip" data-c="/fix ">/fix</span>
      <span class="chip" data-c="/docs ">/docs</span>
      <span class="chip" data-c="/review ">/review</span>
    </div>

    <textarea id="inp" placeholder="Describe what to build..."></textarea>

    <div class="card-toolbar">
      <div class="tb-left">
        <div class="pill" id="pillAgent" title="Toggle Agent Mode (uses workspace tools)">
          <span>🤖 Agent</span>
        </div>
        <div class="pill-select" title="Active AI Provider">
          <span>⚡</span>
          <select id="selProv">${optionsHtml}</select>
        </div>
        <div class="pill-select" id="modelSelectWrap" style="display: none;" title="Active Model">
          <select id="selModel"></select>
        </div>
        <div class="keybar" id="keybar">
          <input type="password" id="keyIn" placeholder="API Key..." />
          <span id="btnSaveKey" style="cursor:pointer;" title="Save Key">💾</span>
        </div>
      </div>
      <button id="btnSend" class="send-pill">Send ⬆</button>
    </div>
  </div>`;
  }

  private getScript(): string {
    return `
(function(){
  var vsc;
  try {
    vsc = acquireVsCodeApi();
  } catch (e) {
    console.error('[AG AI Webview] Failed to acquire VS Code API:', e);
  }

  var streamEl = null;
  var isAgentMode = false;

  function getChat(){ return document.getElementById('chat'); }
  function getInp(){ return document.getElementById('inp'); }
  function getSelProv(){ return document.getElementById('selProv'); }
  function getSelModel(){ return document.getElementById('selModel'); }
  function getKeyIn(){ return document.getElementById('keyIn'); }

  var isUpdatingUI = false;

  // ─── Global Event Delegation ───────────────────────
  document.addEventListener('click', function(e){
    var t = e.target;
    if(!t) return;
    if(t.nodeType === 3) t = t.parentElement;
    if(!t || typeof t.closest !== 'function') return;

    var btnDash = t.id === 'btnDash' ? t : t.closest('#btnDash');
    if(btnDash){
      if(vsc) vsc.postMessage({type:'dashboard'});
      return;
    }

    var btnClear = t.id === 'btnClear' ? t : t.closest('#btnClear');
    if(btnClear){
      if(vsc) vsc.postMessage({type:'clear'});
      return;
    }

    var btnSend = t.id === 'btnSend' ? t : t.closest('#btnSend');
    if(btnSend){
      doSend();
      return;
    }

    var agentPill = t.id === 'pillAgent' ? t : t.closest('#pillAgent');
    if(agentPill){
      isAgentMode = !isAgentMode;
      if(isAgentMode){
        agentPill.classList.add('active');
      } else {
        agentPill.classList.remove('active');
      }
      return;
    }

    var btnSaveKey = t.id === 'btnSaveKey' ? t : t.closest('#btnSaveKey');
    if(btnSaveKey){
      var kIn = getKeyIn();
      var sPr = getSelProv();
      if(kIn && kIn.value && sPr && vsc){
        vsc.postMessage({type:'saveKey', id:sPr.value, key:kIn.value});
        kIn.value = '';
      }
      return;
    }

    if(t.classList && t.classList.contains('chip')){
      var c = t.getAttribute('data-c');
      var inputEl = getInp();
      if(c && inputEl){ inputEl.value = c; inputEl.focus(); }
      return;
    }

    if(t.classList && t.classList.contains('cbtn')){
      var pre = t.closest('pre');
      if(pre){
        var code = pre.querySelector('code');
        if(code && vsc) vsc.postMessage({type:'apply', code:code.innerText});
      }
      return;
    }
  });

  // ─── Dropdown Listeners ─────────────────────────────
  document.addEventListener('change', function(e){
    var t = e.target;
    if(!t || isUpdatingUI || !vsc) return;
    if(t.id === 'selProv'){
      vsc.postMessage({type:'switchProvider', id:t.value});
    } else if(t.id === 'selModel' && t.value){
      vsc.postMessage({type:'switchModel', model:t.value});
    }
  });

  // ─── Keyboard ──────────────────────────────────────
  document.addEventListener('keydown', function(e){
    if(e.target && e.target.id === 'inp' && e.key === 'Enter' && !e.shiftKey){
      e.preventDefault();
      doSend();
    }
  });

  // ─── Send Function ─────────────────────────────────
  function doSend(){
    var inputEl = getInp();
    if(!inputEl) return;
    var text = inputEl.value.trim();
    if(!text) return;

    console.log('[AG Webview] doSend called:', text);
    addMsg('user', text);
    streamEl = addMsg('assistant', '⏳ Thinking...');
    inputEl.value = '';

    if(!vsc){
      if(streamEl) streamEl.innerHTML = '❌ Error: VS Code API not connected.';
      return;
    }

    if(isAgentMode){
      vsc.postMessage({type:'agent', text:text});
    } else {
      var slash = null;
      if(text.charAt(0) === '/'){
        var sp = text.indexOf(' ');
        slash = sp > 0 ? text.substring(1, sp) : text.substring(1);
      }
      vsc.postMessage({type:'chat', text:text, slash:slash});
    }
  }

  // ─── Incoming Messages ─────────────────────────────
  window.addEventListener('message', function(ev){
    var m = ev.data;
    if(!m || !m.type) return;

    if(m.type === 'state'){
      isUpdatingUI = true;
      try {
        var sProv = getSelProv();
        if(sProv){
          sProv.innerHTML = '';
          m.providers.forEach(function(p){
            var o = document.createElement('option');
            o.value = p.id;
            o.textContent = (p.id === m.activeId ? '⭐ ':'') + p.name;
            sProv.appendChild(o);
          });
          sProv.value = m.activeId;
        }

        var sModel = getSelModel();
        var modelSelectWrap = document.getElementById('modelSelectWrap');
        if(sModel){
          sModel.innerHTML = '';
          var curModel = m.active ? m.active.model : '';
          if(m.models && m.models.length > 0){
            var foundActive = false;
            m.models.forEach(function(mdl){
              var o = document.createElement('option');
              o.value = mdl;
              o.textContent = mdl;
              if(mdl === curModel) foundActive = true;
              sModel.appendChild(o);
            });
            if(curModel && !foundActive){
              var o = document.createElement('option');
              o.value = curModel;
              o.textContent = curModel;
              sModel.insertBefore(o, sModel.firstChild);
            }
            if(curModel) sModel.value = curModel;
            if(modelSelectWrap) modelSelectWrap.style.display = 'inline-flex';
          } else if(curModel){
            var o = document.createElement('option');
            o.value = curModel;
            o.textContent = curModel;
            sModel.appendChild(o);
            sModel.value = curModel;
            if(modelSelectWrap) modelSelectWrap.style.display = 'inline-flex';
          } else {
            if(modelSelectWrap) modelSelectWrap.style.display = 'none';
          }
        }

        var kBar = document.getElementById('keybar');
        if(kBar){
          if(m.active && !m.active.hasKey && m.active.url.indexOf('localhost') < 0){
            kBar.style.display = 'inline-flex';
          } else {
            kBar.style.display = 'none';
          }
        }
      } finally {
        isUpdatingUI = false;
      }
    }
    else if(m.type === 'chunk'){
      if(streamEl){
        if(streamEl.innerHTML.indexOf('Thinking') >= 0) streamEl.innerHTML = '';
        streamEl.innerHTML += esc(m.text);
        bot();
      }
    }
    else if(m.type === 'done'){
      if(streamEl){
        streamEl.innerHTML = md(m.text);
        streamEl = null;
        bot();
      }
    }
    else if(m.type === 'error'){
      if(streamEl){
        streamEl.innerHTML = '<b style="color:#f44">Error:</b> ' + esc(m.text);
        streamEl = null;
      }
    }
    else if(m.type === 'cleared'){
      var chatEl = getChat();
      if(chatEl) chatEl.innerHTML = '';
    }
  });

  // ─── Helpers ───────────────────────────────────────
  function addMsg(role, text){
    var chatEl = getChat();
    var d = document.createElement('div');
    d.className = 'msg ' + role;
    d.innerHTML = md(text);
    if(chatEl){
      chatEl.appendChild(d);
    }
    bot();
    return d;
  }

  function bot(){
    var chatEl = getChat();
    if(chatEl) chatEl.scrollTop = chatEl.scrollHeight;
  }

  function esc(s){
    if(!s) return '';
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').split('\\\\n').join('<br>');
  }

  function md(s){
    if(!s) return '';
    s = s.replace(new RegExp('\\\\x60\\\\x60\\\\x60([\\\\s\\\\S]*?)\\\\x60\\\\x60\\\\x60', 'g'), function(_, code){
      var cleanCode = code.replace(/</g,'&lt;').replace(/>/g,'&gt;');
      return '<pre><code>' + cleanCode + '</code><br><button class="cbtn">Apply to Editor</button></pre>';
    });
    s = s.replace(new RegExp('\\\\x60([^\\\\x60]+)\\\\x60', 'g'), '<code>$1</code>');
    s = s.replace(new RegExp('\\\\*\\\\*(.+?)\\\\*\\\\*', 'g'), '<b>$1</b>');
    s = s.split('\\\\n').join('<br>');
    return s;
  }

  console.log('[AG Webview] Initialized successfully!');
  if(vsc) vsc.postMessage({type:'ready'});
})();
`;
  }
}
