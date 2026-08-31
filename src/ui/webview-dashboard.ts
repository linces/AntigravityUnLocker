/**
 * AG Universal AI — Webview Dashboard Panel
 *
 * Renders a rich Webview Panel with real-time metrics, provider health,
 * token usage, error logs, and interactive provider management.
 * Fully event-driven with real-time updates and CSP nonce compliance.
 */

import * as vscode from 'vscode';
import type { ProviderManager } from '../providers/provider-manager';

export class AGWebviewDashboard {
  private static currentPanel: vscode.WebviewPanel | undefined;
  private static disposables: vscode.Disposable[] = [];

  public static show(extensionUri: vscode.Uri, providerManager: ProviderManager): void {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    if (AGWebviewDashboard.currentPanel) {
      AGWebviewDashboard.currentPanel.reveal(column);
      AGWebviewDashboard.updateState(providerManager);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'agDashboard',
      'AG Universal AI — Dashboard & Telemetry',
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        localResourceRoots: [extensionUri],
        retainContextWhenHidden: true,
      }
    );

    AGWebviewDashboard.currentPanel = panel;
    panel.webview.html = AGWebviewDashboard.getHtml(panel.webview, providerManager);

    // Multi-pass state hydration to eliminate rendering race conditions
    AGWebviewDashboard.updateState(providerManager);
    setTimeout(() => AGWebviewDashboard.updateState(providerManager), 250);
    setTimeout(() => AGWebviewDashboard.updateState(providerManager), 800);

    // Listen for messages from Webview
    panel.webview.onDidReceiveMessage(
      async (msg) => {
        switch (msg.type) {
          case 'ready':
            AGWebviewDashboard.updateState(providerManager);
            break;
          case 'switchProvider':
            providerManager.setActiveProvider(msg.id);
            vscode.window.showInformationMessage(`Active provider switched to ${msg.id}`);
            break;
          case 'clearMetrics':
            providerManager.clearMetrics();
            vscode.window.showInformationMessage('Telemetry metrics cleared.');
            break;
          case 'refresh':
            AGWebviewDashboard.updateState(providerManager);
            break;
        }
      },
      null,
      AGWebviewDashboard.disposables
    );

    // Event-driven real-time updates
    const onMetrics = providerManager.onDidChangeMetrics(() => {
      AGWebviewDashboard.updateState(providerManager);
    });
    const onProvider = providerManager.onDidChangeProvider(() => {
      AGWebviewDashboard.updateState(providerManager);
    });
    const onHealth = providerManager.onDidChangeHealth(() => {
      AGWebviewDashboard.updateState(providerManager);
    });

    AGWebviewDashboard.disposables.push(onMetrics, onProvider, onHealth);

    panel.onDidDispose(() => {
      AGWebviewDashboard.currentPanel = undefined;
      AGWebviewDashboard.disposables.forEach((d) => d.dispose());
      AGWebviewDashboard.disposables = [];
    });
  }

  public static updateState(providerManager: ProviderManager): void {
    if (!AGWebviewDashboard.currentPanel) {
      return;
    }

    const activeProvider = providerManager.getActiveProvider();
    const metrics = providerManager.getMetrics();
    const allProviders = [...providerManager.getAllProviders().values()];

    const totalRequests = metrics.length;
    const successCount = metrics.filter((m) => m.status === 'success').length;
    const errorCount = metrics.filter((m) => m.status === 'error').length;
    const totalTokens = metrics.reduce((sum, m) => sum + m.totalTokens, 0);
    const avgLatency = totalRequests > 0
      ? Math.round(metrics.reduce((sum, m) => sum + m.latencyMs, 0) / totalRequests)
      : 0;
    const successRate = totalRequests > 0
      ? Math.round((successCount / totalRequests) * 100)
      : 100;

    const payload = {
      type: 'state',
      activeId: activeProvider?.id || 'groq',
      totalRequests,
      successCount,
      errorCount,
      successRate,
      avgLatency,
      totalTokens,
      providers: allProviders.map((p) => ({
        id: p.id,
        name: p.name,
        model: p.config.model,
        url: p.config.baseUrl,
        isActive: p.id === activeProvider?.id,
      })),
      logs: metrics.slice(-25).reverse().map((m) => ({
        time: m.timestamp.substring(11, 19),
        providerId: m.providerId,
        model: m.model,
        latencyMs: m.latencyMs,
        tokens: m.totalTokens,
        status: m.status,
        error: m.errorMessage || '',
      })),
    };

    try {
      AGWebviewDashboard.currentPanel.webview.postMessage(payload);
    } catch {
      // Ignore if webview panel is disposed
    }
  }

  private static getNonce(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let r = '';
    for (let i = 0; i < 32; i++) {
      r += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return r;
  }

  private static getHtml(webview: vscode.Webview, providerManager: ProviderManager): string {
    const nonce = AGWebviewDashboard.getNonce();
    const csp = webview.cspSource;

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${csp} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AG Universal AI — Dashboard</title>
  <style>
    :root {
      --bg: var(--vscode-editor-background, #1e1e1e);
      --fg: var(--vscode-editor-foreground, #cccccc);
      --card-bg: var(--vscode-sideBar-background, #252526);
      --border: var(--vscode-widget-border, #3c3c3c);
      --accent: var(--vscode-button-background, #0e639c);
      --accent-hover: var(--vscode-button-hoverBackground, #1177bb);
      --active-bg: var(--vscode-list-activeSelectionBackground, #04395e);
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 24px; color: var(--fg); background: var(--bg); }
    .hdr { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; }
    h1 { font-size: 1.6rem; font-weight: 700; color: #ffffff; display: flex; align-items: center; gap: 10px; }
    .hdr-actions { display: flex; gap: 10px; }
    .btn { background: var(--card-bg); border: 1px solid var(--border); color: var(--fg); padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: 600; display: inline-flex; align-items: center; gap: 6px; }
    .btn:hover { background: rgba(255,255,255,0.1); }
    .btn-danger:hover { background: rgba(244,67,54,0.2); border-color: #f44336; color: #f44336; }

    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 16px; margin-bottom: 28px; }
    .stat-card { background: var(--card-bg); padding: 16px; border-radius: 8px; border: 1px solid var(--border); }
    .stat-card .lbl { font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; opacity: 0.7; font-weight: 600; }
    .stat-card .num { font-size: 1.8rem; font-weight: 700; margin-top: 6px; color: #ffffff; }

    .sec-title { font-size: 1.1rem; font-weight: 600; margin-bottom: 14px; color: #ffffff; display: flex; align-items: center; gap: 8px; }
    .providers-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 14px; margin-bottom: 28px; }
    .card { background: var(--card-bg); padding: 14px; border-radius: 8px; border: 1px solid var(--border); cursor: pointer; transition: all 0.15s ease; position: relative; }
    .card:hover { border-color: var(--accent); transform: translateY(-1px); }
    .card.active { border-color: #4caf50; background: var(--active-bg); }
    .card h3 { font-size: 13px; font-weight: 700; color: #ffffff; margin-bottom: 6px; display: flex; align-items: center; justify-content: space-between; }
    .card p { font-size: 11px; opacity: 0.8; margin-top: 3px; word-break: break-all; }
    .card-badge { font-size: 9px; padding: 2px 6px; border-radius: 10px; background: #4caf50; color: #000000; font-weight: 800; }

    table { width: 100%; border-collapse: collapse; background: var(--card-bg); border-radius: 8px; overflow: hidden; border: 1px solid var(--border); }
    th, td { padding: 10px 12px; text-align: left; font-size: 12px; border-bottom: 1px solid var(--border); }
    th { background: rgba(0,0,0,0.3); font-weight: 600; color: #ffffff; }
    tr:last-child td { border-bottom: none; }
    .badge { padding: 3px 8px; border-radius: 4px; font-size: 10px; font-weight: 700; text-transform: uppercase; }
    .badge.success { background: rgba(76,175,80,0.2); color: #4caf50; border: 1px solid rgba(76,175,80,0.4); }
    .badge.error { background: rgba(244,67,54,0.2); color: #f44336; border: 1px solid rgba(244,67,54,0.4); }
    .err-text { font-size: 10px; color: #f44336; margin-top: 2px; font-family: monospace; }
  </style>
</head>
<body>
  <div class="hdr">
    <h1>🚀 AG Universal AI — Telemetry & Provider Dashboard</h1>
    <div class="hdr-actions">
      <button class="btn" id="btnRefresh">🔄 Refresh</button>
      <button class="btn btn-danger" id="btnClear">🧹 Clear Telemetry</button>
    </div>
  </div>

  <div class="grid">
    <div class="stat-card"><div class="lbl">Total Requests</div><div class="num" id="valTotalRequests">0</div></div>
    <div class="stat-card"><div class="lbl">Successful</div><div class="num" id="valSuccess" style="color: #4caf50">0</div></div>
    <div class="stat-card"><div class="lbl">Errors</div><div class="num" id="valErrors" style="color: #f44336">0</div></div>
    <div class="stat-card"><div class="lbl">Success Rate</div><div class="num" id="valSuccessRate">100%</div></div>
    <div class="stat-card"><div class="lbl">Avg Latency</div><div class="num" id="valAvgLatency">0ms</div></div>
    <div class="stat-card"><div class="lbl">Total Tokens</div><div class="num" id="valTotalTokens">0</div></div>
  </div>

  <div class="sec-title">📡 Registered AI Providers (Click card to activate)</div>
  <div class="providers-grid" id="providersGrid"></div>

  <div class="sec-title">📊 Live Request Telemetry Log</div>
  <table>
    <thead>
      <tr>
        <th>Time</th>
        <th>Provider</th>
        <th>Model</th>
        <th>Latency</th>
        <th>Tokens</th>
        <th>Status</th>
      </tr>
    </thead>
    <tbody id="logTableBody">
      <tr><td colspan="6" style="text-align: center; opacity: 0.6; padding: 20px;">No telemetry recorded yet. Send a message in the AG Sidebar Chat!</td></tr>
    </tbody>
  </table>

  <script nonce="${nonce}">
  (function(){
    // ─── Top-Level Error Handler ────────────────────────
    window.onerror = function(msg, url, line, col, error) {
      console.error('[AG Dashboard Script Error]', msg, line, col, error);
    };

    // ─── VS Code API Singleton Cache ────────────────────
    if (typeof window.__agVscApi === 'undefined' || !window.__agVscApi) {
      try {
        if (typeof acquireVsCodeApi === 'function') {
          window.__agVscApi = acquireVsCodeApi();
        }
      } catch (err) {
        console.warn('[AG Dashboard] acquireVsCodeApi warning:', err);
      }
    }
    var vscode = window.__agVscApi || null;
    function postMsg(data){
      if(vscode) vscode.postMessage(data);
    }

    var btnRefresh = document.getElementById('btnRefresh');
    var btnClear = document.getElementById('btnClear');
    var providersGrid = document.getElementById('providersGrid');
    var logTableBody = document.getElementById('logTableBody');

    if(btnRefresh) btnRefresh.addEventListener('click', function(){ postMsg({type:'refresh'}); });
    if(btnClear) btnClear.addEventListener('click', function(){ postMsg({type:'clearMetrics'}); });

    if(providersGrid) {
      providersGrid.addEventListener('click', function(e){
        var card = e.target.closest('.card');
        if(card && card.getAttribute('data-id')){
          postMsg({type:'switchProvider', id: card.getAttribute('data-id')});
        }
      });
    }

    window.addEventListener('message', function(ev){
      var m = ev.data;
      if(!m || m.type !== 'state') return;

      document.getElementById('valTotalRequests').textContent = m.totalRequests;
      document.getElementById('valSuccess').textContent = m.successCount;
      document.getElementById('valErrors').textContent = m.errorCount;
      document.getElementById('valSuccessRate').textContent = m.successRate + '%';
      document.getElementById('valAvgLatency').textContent = m.avgLatency + 'ms';
      document.getElementById('valTotalTokens').textContent = m.totalTokens.toLocaleString();

      // Render Providers
      providersGrid.innerHTML = '';
      m.providers.forEach(function(p){
        var d = document.createElement('div');
        d.className = 'card' + (p.isActive ? ' active' : '');
        d.setAttribute('data-id', p.id);
        d.innerHTML = '<h3>' + esc(p.name) + (p.isActive ? ' <span class="card-badge">ACTIVE</span>':'') + '</h3>' +
                      '<p><strong>Model:</strong> ' + esc(p.model) + '</p>' +
                      '<p><strong>Endpoint:</strong> ' + esc(p.url) + '</p>';
        providersGrid.appendChild(d);
      });

      // Render Table
      if(!m.logs || m.logs.length === 0){
        logTableBody.innerHTML = '<tr><td colspan="6" style="text-align: center; opacity: 0.6; padding: 20px;">No telemetry recorded yet. Send a message in the AG Sidebar Chat!</td></tr>';
      } else {
        logTableBody.innerHTML = '';
        m.logs.forEach(function(l){
          var tr = document.createElement('tr');
          tr.innerHTML = '<td>' + esc(l.time) + '</td>' +
                         '<td><strong>' + esc(l.providerId) + '</strong></td>' +
                         '<td>' + esc(l.model) + '</td>' +
                         '<td>' + l.latencyMs + 'ms</td>' +
                         '<td>' + l.tokens + '</td>' +
                         '<td><span class="badge ' + l.status + '">' + l.status + '</span>' +
                         (l.error ? '<div class="err-text">' + esc(l.error) + '</div>' : '') + '</td>';
          logTableBody.appendChild(tr);
        });
      }
    });

    function esc(s){
      if(!s) return '';
      return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    }

    postMsg({type:'ready'});
  })();
  </script>
</body>
</html>`;
  }
}
