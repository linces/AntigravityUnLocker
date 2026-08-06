/**
 * AG Universal AI — Sidebar Webview View Provider
 *
 * Uses VS Code nonce-based CSP for script execution.
 * All event handling via addEventListener (CSP compliant).
 */

import * as vscode from 'vscode';
import type { ProviderManager } from '../providers/provider-manager';
import type { SessionManager } from '../chat/session-manager';
import type { ToolRegistry } from '../tools/tool-registry';
import type { AgentEngine } from '../agent/engine';
import { getAllPresets } from '../providers/provider-registry';
import { buildSystemPrompt, buildSlashCommandPrompt } from '../chat/prompt-builder';

export class AGSidebarWebviewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
  private view?: vscode.WebviewView;
  private disposables: vscode.Disposable[] = [];

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly providerManager: ProviderManager,
    private readonly sessionManager: SessionManager,
    private readonly toolRegistry: ToolRegistry,
    private readonly agentEngine: AgentEngine,
    private readonly outputChannel: vscode.OutputChannel
  ) {
    this.disposables.push(
      this.providerManager.onDidChangeProvider(() => this.postStateUpdate()),
      this.sessionManager.onDidChangeSession(() => this.postStateUpdate()),
      this.sessionManager.onDidChangeSessionList(() => this.postStateUpdate())
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
            await this.handleChat(msg.text, msg.slash, msg.images);
            break;
          case 'agent':
            await this.handleAgent(msg.text);
            break;
          case 'pickFile': {
            const uris = await vscode.window.showOpenDialog({
              canSelectMany: true,
              openLabel: 'Attach File to AG AI',
            });
            if (uris) {
              for (const uri of uris) {
                try {
                  const doc = await vscode.workspace.openTextDocument(uri);
                  const rel = vscode.workspace.asRelativePath(uri);
                  this.post({
                    type: 'fileAttached',
                    name: rel,
                    path: uri.fsPath,
                    content: doc.getText(),
                  });
                } catch (e) {
                  this.log(`Error reading attached file ${uri.fsPath}: ${e}`);
                }
              }
            }
            break;
          }
          case 'openFile': {
            try {
              let filePath = msg.path;
              let line = 0;
              const match = filePath.match(/#L(\d+)(?:-L\d+)?$/);
              if (match) {
                line = parseInt(match[1], 10);
                filePath = filePath.replace(/#L\d+(?:-L\d+)?$/, '');
              }
              const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri;
              let uri: vscode.Uri;
              if (filePath.startsWith('file:///')) {
                uri = vscode.Uri.parse(filePath);
              } else if (filePath.includes(':\\') || filePath.startsWith('/')) {
                uri = vscode.Uri.file(filePath);
              } else if (workspaceFolder) {
                uri = vscode.Uri.joinPath(workspaceFolder, filePath);
              } else {
                uri = vscode.Uri.file(filePath);
              }
              const doc = await vscode.workspace.openTextDocument(uri);
              const editor = await vscode.window.showTextDocument(doc, { preview: true });
              if (line > 0) {
                const pos = new vscode.Position(line - 1, 0);
                editor.selection = new vscode.Selection(pos, pos);
                editor.revealRange(new vscode.Range(pos, pos));
              }
            } catch (err) {
              this.log(`Error opening file ${msg.path}: ${err}`);
            }
            break;
          }
          case 'switchSession':
            if (msg.id) {
              await this.sessionManager.setActiveSession(msg.id);
            }
            break;
          case 'newSession':
            this.sessionManager.createSession('New Chat', this.providerManager.getActiveProviderId());
            break;
          case 'deleteSession':
            await this.sessionManager.deleteSession(msg.id || this.sessionManager.getActiveSession().id);
            break;
          case 'clear':
            await this.sessionManager.clearActiveMessages();
            this.post({ type: 'cleared' });
            break;
          case 'dashboard':
            vscode.commands.executeCommand('ag-universal-ai.showDashboard');
            break;
          case 'apply':
            this.applyCode(msg.code);
            break;
          case 'saveFile': {
            let targetPath = msg.path;
            if (!targetPath || !targetPath.trim()) {
              targetPath = await vscode.window.showInputBox({
                prompt: 'Enter file path to create in workspace (e.g., "SECURITY_AUDIT_PulsePrice.md")',
                placeHolder: 'SECURITY_AUDIT_PulsePrice.md',
              });
            }
            if (targetPath) {
              const result = await this.toolRegistry.fileTools.writeFile(targetPath.trim(), msg.code);
              vscode.window.showInformationMessage(`AG AI: ${result}`);
              try {
                const uri = this.toolRegistry.fileTools.resolveUri(targetPath.trim());
                if (uri) {
                  const doc = await vscode.workspace.openTextDocument(uri);
                  await vscode.window.showTextDocument(doc, { preview: true });
                }
              } catch (e) {
                this.log(`Error opening newly created file: ${e}`);
              }
            }
            break;
          }
        }
      } catch (err: unknown) {
        const m = err instanceof Error ? err.message : String(err);
        this.log(`ERROR handling ${msg.type}: ${m}`);
        this.post({ type: 'error', text: m });
      }
    });

    // Hydrate state immediately and schedule retries to eliminate Webview mounting race conditions
    this.postStateUpdate();
    setTimeout(() => this.postStateUpdate(), 300);
    setTimeout(() => this.postStateUpdate(), 1000);
  }

  // ── Chat Handler ──────────────────────────────────────────────────────────

  private async handleChat(text: string, slash?: string, images?: string[]): Promise<void> {
    let userContent: any = text;
    if (images && images.length > 0) {
      userContent = [
        { type: 'text', text },
        ...images.map(img => ({ type: 'image_url', image_url: { url: img } }))
      ];
    }
    const activeProvider = this.providerManager.getActiveProvider();
    await this.sessionManager.addMessage(
      'user',
      userContent,
      activeProvider?.id,
      activeProvider?.config.model
    );

    // Auto-detect intent to create/generate files or artifacts autonomously
    const lowerText = text.toLowerCase();
    const isCreateFileIntent =
      lowerText.includes('crie um arquivo') ||
      lowerText.includes('crie o arquivo') ||
      lowerText.includes('criar arquivo') ||
      lowerText.includes('crie um artefato') ||
      lowerText.includes('salve o arquivo') ||
      lowerText.includes('salve no arquivo') ||
      lowerText.includes('gerar arquivo') ||
      lowerText.includes('create file') ||
      lowerText.includes('write file') ||
      lowerText.includes('save file');

    if (isCreateFileIntent) {
      this.log(`Auto-routing file creation request "${text}" to Agent Engine...`);
      return this.handleAgent(text);
    }

    const provider = activeProvider;
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
        ctx += `\nFile: ${rel} (selection):\n\`\`\`${ed.document.languageId}\n${sel}\n\`\`\``;
      } else if (ed.document.getText().length < 20000) {
        ctx += `\nFile: ${rel}:\n\`\`\`${ed.document.languageId}\n${ed.document.getText()}\n\`\`\``;
      }
    }

    // Auto-detect folder / workspace analysis request or @workspace mention
    const isWorkspaceRequest =
      lowerText.includes('@workspace') ||
      lowerText.includes('folder') ||
      lowerText.includes('pasta') ||
      lowerText.includes('projeto') ||
      lowerText.includes('diretório') ||
      lowerText.includes('diretorio') ||
      lowerText.includes('estrutura');

    if (isWorkspaceRequest) {
      try {
        const files = await vscode.workspace.findFiles(
          '**/*',
          '**/{node_modules,.git,dist,build,.vs,.vscode,vendor,out,coverage}/**',
          100
        );
        const relPaths = files.map((f) => vscode.workspace.asRelativePath(f)).sort();
        const wsName = vscode.workspace.workspaceFolders?.[0]?.name || 'Workspace';
        ctx += `\n\n[Active Workspace Directory Structure (${wsName}) - ${relPaths.length} files]:\n` +
          relPaths.map((p) => `- ${p}`).join('\n');
      } catch (e) {
        this.log(`Error scanning workspace structure: ${e}`);
      }
    }

    // Auto-detect project context files (contexto.md, notas.md, .ag/context.md, context.md, AGENTS.md)
    try {
      const contextFiles = await vscode.workspace.findFiles(
        '{contexto.md,notas.md,.ag/context.md,context.md,AGENTS.md}',
        '**/node_modules/**',
        5
      );
      for (const fileUri of contextFiles) {
        const doc = await vscode.workspace.openTextDocument(fileUri);
        const rel = vscode.workspace.asRelativePath(fileUri);
        ctx += `\n\n[Project Context File (${rel})]:\n${doc.getText()}`;
      }
    } catch (e) {
      this.log(`Error reading project context files: ${e}`);
    }

    const activeSession = this.sessionManager.getActiveSession();
    const sessionHistory = activeSession.messages;

    const msgs = [
      { role: 'system' as const, content: sysPrompt },
      ...sessionHistory.slice(-6).map(m => ({ role: m.role as any, content: m.content as any })),
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
      const rawMsg = err instanceof Error ? err.message : String(err);
      this.log(`Provider ${provider.id} failed: ${rawMsg}`);

      // Format clean, actionable user diagnostic message
      let formattedMsg = rawMsg;
      if (rawMsg.includes('401') || rawMsg.toLowerCase().includes('unauthorized') || rawMsg.toLowerCase().includes('api key')) {
        formattedMsg = `🔑 **Authentication Failed**: Invalid or missing API key for **${provider.name}**.\n\nPlease enter a valid API key in the yellow key input bar below and click 💾, or run command \`AG AI: Set API Key for Provider\`.`;
      } else if (rawMsg.includes('ECONNREFUSED') || rawMsg.toLowerCase().includes('fetch failed')) {
        formattedMsg = `🔌 **Connection Refused**: Could not reach **${provider.name}** at \`${provider.config.baseUrl}\`.\n\nMake sure the local server (e.g. Ollama / LM Studio) is running and accessible on your machine.`;
      } else if (rawMsg.includes('404') || rawMsg.toLowerCase().includes('not found')) {
        formattedMsg = `❓ **Model Not Found**: The model \`${provider.config.model}\` was not recognized by **${provider.name}**.\n\nSelect a different model using the model dropdown below.`;
      }

      const latencyMs = Date.now() - startTime;
      this.providerManager.recordMetric({
        providerId: provider.id,
        model: provider.config.model,
        isStream: true,
        promptTokens: promptTokensEst,
        completionTokens: 0,
        latencyMs,
        status: 'error',
        errorMessage: rawMsg,
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
          full = `❌ ${provider.name}: ${formattedMsg}\n❌ ${fb.name}: ${m2}`;
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
        full = `❌ ${provider.name}: ${formattedMsg}`;
      }
    }

    if (full) {
      await this.sessionManager.addMessage(
        'assistant',
        full,
        provider.id,
        provider.config.model
      );
    }
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

    const activeSession = this.sessionManager.getActiveSession();
    const sessions = this.sessionManager.getSessions().map(s => ({
      id: s.id,
      title: s.title,
      messageCount: s.messages.length,
    }));

    // 1. Post immediate state update (optimistic UI response)
    const initialModels = ap?.config.model ? [ap.config.model] : [];
    this.post({
      type: 'state',
      activeId,
      activeSessionId: activeSession.id,
      sessions,
      history: activeSession.messages,
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
      activeSessionId: activeSession.id,
      sessions,
      history: activeSession.messages,
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
      '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src ' + csp + ' https: data:; font-src ' + csp + ' https: data:; style-src ' + csp + ' \'unsafe-inline\'; script-src \'nonce-' + nonce + '\';">\n' +
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
      .code-hdr { display: flex; justify-content: space-between; align-items: center; background: #1e1e1e; padding: 4px 8px; border-top-left-radius: 6px; border-top-right-radius: 6px; font-size: 10px; color: #aaa; border-bottom: 1px solid #2a2a2a; font-family: monospace; }
      .stepper-step { background: rgba(0,122,204,0.1); border-left: 3px solid var(--accent); padding: 4px 8px; margin: 4px 0; border-radius: 4px; font-size: 11px; }
      code { font-family: var(--vscode-editor-font-family, monospace); font-size: 11px; }
      .cbtn { background: #222; border: 1px solid #444; color: #ccc; padding: 3px 8px; border-radius: 4px; font-size: 10px; cursor: pointer; display: inline-block; }
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

      .attachment-bar { display: flex; gap: 6px; flex-wrap: wrap; padding: 4px 0; border-bottom: 1px solid rgba(255,255,255,0.06); }
      .file-pill { display: inline-flex; align-items: center; gap: 4px; background: rgba(0,122,204,0.2); border: 1px solid rgba(0,122,204,0.4); color: #fff; padding: 2px 8px; border-radius: 12px; font-size: 11px; }
      .file-pill-remove { cursor: pointer; color: #aaa; margin-left: 2px; }
      .file-pill-remove:hover { color: #ff5555; }
      .img-thumb-preview { position: relative; display: inline-block; width: 44px; height: 44px; border-radius: 6px; overflow: hidden; border: 1px solid var(--accent); }
      .img-thumb-preview img { width: 100%; height: 100%; object-fit: cover; }
      .img-thumb-remove { position: absolute; top: 1px; right: 1px; background: rgba(0,0,0,0.7); color: #fff; border-radius: 50%; width: 14px; height: 14px; display: flex; align-items: center; justify-content: center; font-size: 9px; cursor: pointer; }

      .emoji-picker-popover { position: absolute; bottom: 55px; left: 10px; background: var(--card-bg); border: 1px solid var(--border); border-radius: 8px; padding: 8px; box-shadow: 0 4px 16px rgba(0,0,0,0.4); z-index: 100; width: 220px; }
      .emoji-picker-hdr { font-size: 10px; color: #888; margin-bottom: 6px; font-weight: bold; }
      .emoji-picker-grid { display: grid; grid-template-columns: repeat(6, 1fr); gap: 4px; max-height: 120px; overflow-y: auto; }
      .emoji-btn { background: transparent; border: none; font-size: 16px; cursor: pointer; border-radius: 4px; padding: 2px; text-align: center; }
      .emoji-btn:hover { background: rgba(255,255,255,0.1); }
      a.file-link { color: var(--accent); text-decoration: underline; cursor: pointer; }
    `;
  }

  private getBody(optionsHtml: string): string {
    return `
  <div class="hdr">
    <div class="hdr-row">
      <span class="brand">🤖 AG AI</span>
      <div class="session-bar" style="display: flex; align-items: center; gap: 4px; flex: 1; max-width: 170px; margin: 0 4px;">
        <select id="selSession" class="hdr-select" title="Switch Chat Session" style="background: var(--card-bg); color: var(--fg); border: 1px solid var(--border); border-radius: 4px; font-size: 11px; padding: 2px 4px; width: 100%; text-overflow: ellipsis; outline: none; cursor: pointer;">
          <option value="">Loading sessions...</option>
        </select>
        <button class="ibtn" id="btnNewSession" title="New Chat Session (➕)">➕</button>
        <button class="ibtn" id="btnDelSession" title="Delete Session (🗑️)">🗑️</button>
      </div>
      <div class="hdr-btns">
        <button class="ibtn" id="btnClear" title="Clear Messages">🧹</button>
        <button class="ibtn" id="btnDash" title="Dashboard">📊</button>
      </div>
    </div>
  </div>

  <div id="chat">
    <div class="msg assistant">👋 Welcome to <b>AG Universal AI</b>! Describe what to build or ask AI.</div>
  </div>

  <div class="input-card">
    <div class="chips" id="chips">
      <span class="chip" data-c="@workspace ">@workspace</span>
      <span class="chip" data-c="/explain ">/explain</span>
      <span class="chip" data-c="/refactor ">/refactor</span>
      <span class="chip" data-c="/test ">/test</span>
      <span class="chip" data-c="/fix ">/fix</span>
      <span class="chip" data-c="/docs ">/docs</span>
      <span class="chip" data-c="/review ">/review</span>
    </div>

    <div id="attachmentBar" class="attachment-bar" style="display: none;"></div>

    <textarea id="inp" placeholder="Describe what to build..."></textarea>

    <div id="emojiPicker" class="emoji-picker-popover" style="display: none;"></div>

    <div class="card-toolbar">
      <div class="tb-left">
        <button type="button" class="ibtn" id="btnAttachFile" title="Attach File (📎)">📎</button>
        <button type="button" class="ibtn" id="btnEmoji" title="Insert Emoji (😀)">😀</button>
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
  var vsc = null;
  try {
    if (window.__agVscApi) {
      vsc = window.__agVscApi;
    } else if (typeof acquireVsCodeApi === 'function') {
      vsc = acquireVsCodeApi();
      window.__agVscApi = vsc;
    }
  } catch (e) {
    vsc = window.__agVscApi || null;
    console.error('[AG AI Webview] acquireVsCodeApi error:', e);
  }

  var streamEl = null;
  var currentStreamText = '';
  var isAgentMode = false;

  var attachedFiles = [];
  var attachedImages = [];

  function getChat(){ return document.getElementById('chat'); }
  function getInp(){ return document.getElementById('inp'); }
  function getSelProv(){ return document.getElementById('selProv'); }
  function getSelModel(){ return document.getElementById('selModel'); }
  function getKeyIn(){ return document.getElementById('keyIn'); }

  var isUpdatingUI = false;

  function renderAttachments(){
    var bar = document.getElementById('attachmentBar');
    if(!bar) return;
    bar.innerHTML = '';
    if(attachedFiles.length === 0 && attachedImages.length === 0){
      bar.style.display = 'none';
      return;
    }
    bar.style.display = 'flex';
    attachedFiles.forEach(function(f, idx){
      var d = document.createElement('div');
      d.className = 'file-pill';
      d.innerHTML = '📎 ' + esc(f.name) + ' <span class="file-pill-remove" data-idx="' + idx + '">✖</span>';
      bar.appendChild(d);
    });
    attachedImages.forEach(function(imgUrl, idx){
      var d = document.createElement('div');
      d.className = 'img-thumb-preview';
      d.innerHTML = '<img src="' + imgUrl + '"/><div class="img-thumb-remove" data-idx="' + idx + '">✖</div>';
      bar.appendChild(d);
    });
  }

  var barEl = document.getElementById('attachmentBar');
  if(barEl){
    barEl.addEventListener('click', function(e){
      if(e.target.classList.contains('file-pill-remove')){
        var idx = parseInt(e.target.getAttribute('data-idx'), 10);
        attachedFiles.splice(idx, 1);
        renderAttachments();
      } else if(e.target.classList.contains('img-thumb-remove')){
        var idx = parseInt(e.target.getAttribute('data-idx'), 10);
        attachedImages.splice(idx, 1);
        renderAttachments();
      }
    });
  }

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

    var btnNewSession = t.id === 'btnNewSession' ? t : t.closest('#btnNewSession');
    if(btnNewSession){
      if(vsc) vsc.postMessage({type:'newSession'});
      return;
    }

    var btnDelSession = t.id === 'btnDelSession' ? t : t.closest('#btnDelSession');
    if(btnDelSession){
      if(vsc) vsc.postMessage({type:'deleteSession'});
      return;
    }

    var btnSend = t.id === 'btnSend' ? t : t.closest('#btnSend');
    if(btnSend){
      doSend();
      return;
    }

    var btnAttachFile = t.id === 'btnAttachFile' ? t : t.closest('#btnAttachFile');
    if(btnAttachFile){
      if(vsc) vsc.postMessage({type:'pickFile'});
      return;
    }

    var btnEmoji = t.id === 'btnEmoji' ? t : t.closest('#btnEmoji');
    var emojiPicker = document.getElementById('emojiPicker');
    if(btnEmoji && emojiPicker){
      emojiPicker.style.display = emojiPicker.style.display === 'none' ? 'block' : 'none';
      return;
    }

    var fileLink = t.tagName === 'A' && t.classList.contains('file-link') ? t : t.closest('a.file-link');
    if(fileLink){
      e.preventDefault();
      var fp = fileLink.getAttribute('data-path');
      if(fp && vsc) vsc.postMessage({type:'openFile', path:fp});
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

    if(t.classList && (t.classList.contains('cbtn') || t.classList.contains('apply-btn')) && !t.classList.contains('save-btn')){
      var pre = t.closest('pre');
      if(pre){
        var code = pre.querySelector('code');
        if(code && vsc) vsc.postMessage({type:'apply', code:code.innerText});
      }
      return;
    }

    if(t.classList && t.classList.contains('save-btn')){
      var pre = t.closest('pre');
      if(pre){
        var code = pre.querySelector('code');
        var hdrSpan = pre.querySelector('.code-hdr span');
        var langOrPath = hdrSpan ? hdrSpan.innerText.trim() : '';
        var detectedPath = (langOrPath.includes('.') || langOrPath.includes('/') || langOrPath.includes('\\')) ? langOrPath : '';
        if(code && vsc) vsc.postMessage({type:'saveFile', code:code.innerText, path:detectedPath});
      }
      return;
    }
  });

  // ─── Clipboard Paste Handler (Ctrl+V Screenshots) ───
  document.addEventListener('paste', function(e){
    if(!e.clipboardData || !e.clipboardData.items) return;
    var items = e.clipboardData.items;
    for (var i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        var blob = items[i].getAsFile();
        if(blob){
          var reader = new FileReader();
          reader.onload = function(evt) {
            attachedImages.push(evt.target.result);
            renderAttachments();
          };
          reader.readAsDataURL(blob);
          e.preventDefault();
        }
      }
    }
  });

  // ─── Drag & Drop Handlers ──────────────────────────
  window.addEventListener('dragover', function(e){ e.preventDefault(); });
  window.addEventListener('drop', function(e){
    e.preventDefault();
    if(e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0){
      for(var i = 0; i < e.dataTransfer.files.length; i++){
        var file = e.dataTransfer.files[i];
        if(file.type.indexOf('image') !== -1){
          var reader = new FileReader();
          reader.onload = function(evt){
            attachedImages.push(evt.target.result);
            renderAttachments();
          };
          reader.readAsDataURL(file);
        } else {
          var reader = new FileReader();
          reader.onload = (function(f){
            return function(evt){
              attachedFiles.push({ name: f.name, path: f.name, content: evt.target.result });
              renderAttachments();
            };
          })(file);
          reader.readAsText(file);
        }
      }
    }
  });

  // ─── Emoji Picker Popover Setup ────────────────────
  var emojiPicker = document.getElementById('emojiPicker');
  var emojis = ['🚀','⚡','🐛','🔧','🤖','💡','🧪','📦','🎨','🎯','🔒','💻','⚙️','📝','🔥','👍','👎','🎉','❤️','😄','🤔','🙌','👏','👀','💯','🙏'];
  if(emojiPicker){
    var gridHtml = '<div class="emoji-picker-hdr">Select Emoji</div><div class="emoji-picker-grid">';
    emojis.forEach(function(em){
      gridHtml += '<button type="button" class="emoji-btn" data-em="' + em + '">' + em + '</button>';
    });
    gridHtml += '</div>';
    emojiPicker.innerHTML = gridHtml;

    emojiPicker.addEventListener('click', function(e){
      if(e.target.classList.contains('emoji-btn')){
        var em = e.target.getAttribute('data-em');
        var inputEl = getInp();
        if(inputEl){
          var start = inputEl.selectionStart || inputEl.value.length;
          var end = inputEl.selectionEnd || inputEl.value.length;
          inputEl.value = inputEl.value.substring(0, start) + em + inputEl.value.substring(end);
          inputEl.focus();
          inputEl.selectionStart = inputEl.selectionEnd = start + em.length;
        }
        emojiPicker.style.display = 'none';
      }
    });
  }

  // ─── Dropdown Listeners ─────────────────────────────
  document.addEventListener('change', function(e){
    var t = e.target;
    if(!t || isUpdatingUI || !vsc) return;
    if(t.id === 'selProv'){
      vsc.postMessage({type:'switchProvider', id:t.value});
    } else if(t.id === 'selModel' && t.value){
      vsc.postMessage({type:'switchModel', model:t.value});
    } else if(t.id === 'selSession' && t.value){
      vsc.postMessage({type:'switchSession', id:t.value});
    }
  });

  // ─── Keyboard & Auto-Resize ────────────────────────
  document.addEventListener('input', function(e){
    var t = e.target;
    if(t && t.id === 'inp'){
      t.style.height = 'auto';
      t.style.height = Math.min(t.scrollHeight, 140) + 'px';
    }
  });

  document.addEventListener('keydown', function(e){
    if(e.target && e.target.id === 'inp' && e.key === 'Enter' && !e.shiftKey){
      e.preventDefault();
      doSend();
    }
  });

  // ─── Send Function ─────────────────────────────────
  var lastStreamStartTime = 0;
  function doSend(){
    if(streamEl !== null){
      if(Date.now() - lastStreamStartTime > 12000){
        console.warn('[AG Webview] Clearing stale stream indicator');
        streamEl = null;
      } else {
        return;
      }
    }
    lastStreamStartTime = Date.now();
    var inputEl = getInp();
    if(!inputEl) return;
    var text = inputEl.value.trim();
    if(!text && attachedFiles.length === 0 && attachedImages.length === 0) return;

    var nl = String.fromCharCode(10);
    var fullText = text;
    if(attachedFiles.length > 0){
      var bt = String.fromCharCode(96) + String.fromCharCode(96) + String.fromCharCode(96);
      attachedFiles.forEach(function(f){
        fullText += nl + nl + '[Attached File: ' + f.name + ']' + nl + bt + nl + f.content + nl + bt;
      });
    }

    console.log('[AG Webview] doSend called:', fullText);
    addMsg('user', fullText);
    currentStreamText = '';
    streamEl = addMsg('assistant', '⏳ Thinking...');
    inputEl.value = '';
    inputEl.style.height = 'auto';

    if(!vsc){
      if(streamEl) streamEl.innerHTML = '❌ Error: VS Code API not connected.';
      return;
    }

    var payload = { type: isAgentMode ? 'agent' : 'chat', text: fullText };
    if(attachedImages.length > 0){
      payload.images = attachedImages.slice();
    }

    if(!isAgentMode){
      if(text.charAt(0) === '/'){
        var sp = text.indexOf(' ');
        payload.slash = sp > 0 ? text.substring(1, sp) : text.substring(1);
      }
    }

    vsc.postMessage(payload);

    attachedFiles = [];
    attachedImages = [];
    renderAttachments();
  }

  // ─── Incoming Messages ─────────────────────────────
  window.addEventListener('message', function(ev){
    try {
      var m = ev.data;
      if(!m || !m.type) return;

      if(m.type === 'fileAttached'){
        attachedFiles.push({ name: m.name, path: m.path, content: m.content });
        renderAttachments();
      }
      else if(m.type === 'state'){
        isUpdatingUI = true;
        try {
          var sSession = document.getElementById('selSession');
          if(sSession && m.sessions && Array.isArray(m.sessions)){
            sSession.innerHTML = '';
            m.sessions.forEach(function(s){
              var o = document.createElement('option');
              o.value = s.id;
              o.textContent = (s.title || 'Chat Session') + (s.messageCount ? ' (' + s.messageCount + ')' : '');
              sSession.appendChild(o);
            });
            if(m.activeSessionId) sSession.value = m.activeSessionId;
          }

          if(!streamEl && m.history && Array.isArray(m.history)){
            var chatEl = getChat();
            if(chatEl){
              chatEl.innerHTML = '';
              if(m.history.length === 0){
                addMsg('assistant', '👋 Welcome to <b>AG Universal AI</b>! Describe what to build or ask AI.');
              } else {
                m.history.forEach(function(item){
                  addMsg(item.role, item.content);
                });
              }
            }
          }

          var sProv = getSelProv();
          if(sProv && m.providers){
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
            if(m.active && !m.active.hasKey && m.active.url && m.active.url.indexOf('localhost') < 0){
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
          currentStreamText += (m.text || '');
          streamEl.innerHTML = md(currentStreamText);
          bot();
        }
      }
      else if(m.type === 'done'){
        if(streamEl){
          var finalText = (m.text || currentStreamText);
          streamEl.innerHTML = md(finalText);
          streamEl = null;
          currentStreamText = '';
          bot();
        }
      }
      else if(m.type === 'error'){
        if(streamEl){
          streamEl.innerHTML = '<div style="color:#ff5555;font-weight:bold;">❌ Error: ' + esc(m.text) + '</div>';
          streamEl = null;
          currentStreamText = '';
        }
      }
      else if(m.type === 'cleared'){
        var chatEl = getChat();
        if(chatEl) chatEl.innerHTML = '';
        streamEl = null;
        currentStreamText = '';
      }
    } catch(err) {
      console.error('[AG AI Webview Error]', err);
    }
  });

  // ─── Helpers ───────────────────────────────────────
  function addMsg(role, text){
    var chatEl = getChat();
    var d = document.createElement('div');
    d.className = 'msg ' + role;
    if(typeof text !== 'string'){
      if(Array.isArray(text)){
        text = text.map(function(c){
          if(typeof c === 'string') return c;
          return (c && typeof c === 'object' && c.text) ? c.text : '';
        }).join(' ');
      } else {
        text = String(text || '');
      }
    }
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
    if(typeof s !== 'string') s = String(s);
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
  }

  function md(s){
    if(!s) return '';
    if(typeof s !== 'string'){
      if(Array.isArray(s)){
        s = s.map(function(c){
          if(typeof c === 'string') return c;
          return (c && typeof c === 'object' && c.text) ? c.text : '';
        }).join(' ');
      } else {
        s = String(s);
      }
    }
    var codeBlocks = [];
    var text = s.replace(/\`\`\`([\s\S]*?)\`\`\`/g, function(_, block){
      var id = '___CODE_BLOCK_' + codeBlocks.length + '___';
      var firstNewline = block.indexOf(String.fromCharCode(10));
      var lang = '';
      var code = block;
      if (firstNewline > 0 && firstNewline < 20 && !block.substring(0, firstNewline).includes(' ')) {
        lang = block.substring(0, firstNewline).trim();
        code = block.substring(firstNewline + 1);
      }
      var cleanCode = esc(code.trim());
      var blockHtml = '<pre><div class="code-hdr"><span>' + (lang || 'code') + '</span><div><button class="cbtn save-btn">Save File 📄</button> <button class="cbtn apply-btn">Apply to Editor</button></div></div><code>' + cleanCode + '</code></pre>';
      codeBlocks.push(blockHtml);
      return id;
    });

    text = esc(text);

    text = text.replace(/\`([^\`]+)\`/g, '<code>$1</code>');
    text = text.replace(new RegExp('[*][*](.+?)[*][*]', 'g'), '<b>$1</b>');
    text = text.replace(new RegExp('[*]([^*]+)[*]', 'g'), '<i>$1</i>');
    text = text.replace(new RegExp('^### (.*$)', 'gm'), '<h4 style="margin:4px 0">$1</h4>');
    text = text.replace(new RegExp('^## (.*$)', 'gm'), '<h3 style="margin:6px 0">$1</h3>');
    text = text.replace(new RegExp('^# (.*$)', 'gm'), '<h2 style="margin:8px 0">$1</h2>');
    text = text.replace(new RegExp('^[-*] (.*$)', 'gm'), '• $1');
    text = text.replace(new RegExp('^(?:⏳|🔄|✅|❌) (.*$)', 'gm'), '<div class="stepper-step">$1</div>');

    text = text.replace(new RegExp(':rocket:', 'g'), '🚀');
    text = text.replace(new RegExp(':bug:', 'g'), '🐛');
    text = text.replace(new RegExp(':fire:', 'g'), '🔥');
    text = text.replace(new RegExp(':check:', 'g'), '✅');
    text = text.replace(new RegExp(':warning:', 'g'), '⚠️');
    text = text.replace(new RegExp(':zap:', 'g'), '⚡');
    text = text.replace(new RegExp(':bulb:', 'g'), '💡');
    text = text.replace(new RegExp(':robot:', 'g'), '🤖');
    text = text.replace(new RegExp(':package:', 'g'), '📦');
    text = text.replace(new RegExp(':smile:', 'g'), '😄');
    text = text.replace(new RegExp(':thumbsup:', 'g'), '👍');

    text = text.replace(new RegExp('(file:///[^\\s<]+|\\b(?:[a-zA-Z]:\\\\\\\\|src\\/|docs\\/)[^\\s<]+)', 'g'), '<a href="#" class="file-link" data-path="$1">$1</a>');

    text = text.split(String.fromCharCode(10)).join('<br>');

    for (var i = 0; i < codeBlocks.length; i++) {
      text = text.replace('___CODE_BLOCK_' + i + '___', codeBlocks[i]);
    }

    return text;
  }

  console.log('[AG Webview] Initialized successfully!');
  if(vsc) vsc.postMessage({type:'ready'});
})();
`;
  }
}
