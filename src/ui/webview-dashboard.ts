/**
 * AG Universal AI — Webview Dashboard Panel
 *
 * Renders a rich Webview Panel with real-time metrics, provider health,
 * token usage, and request logs.
 */

import * as vscode from 'vscode';
import type { ProviderManager } from '../providers/provider-manager';

export class AGWebviewDashboard {
  private static currentPanel: vscode.WebviewPanel | undefined;

  public static show(extensionUri: vscode.Uri, providerManager: ProviderManager): void {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    if (AGWebviewDashboard.currentPanel) {
      AGWebviewDashboard.currentPanel.reveal(column);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'agDashboard',
      'AG Universal AI — Dashboard',
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        localResourceRoots: [extensionUri],
      }
    );

    AGWebviewDashboard.currentPanel = panel;
    panel.webview.html = AGWebviewDashboard.getHtml(providerManager);

    panel.onDidDispose(() => {
      AGWebviewDashboard.currentPanel = undefined;
    });
  }

  private static getHtml(providerManager: ProviderManager): string {
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

    const recentLogs = metrics
      .slice(-10)
      .reverse()
      .map(
        (m) =>
          `<tr>
            <td>${m.timestamp.substring(11, 19)}</td>
            <td><strong>${m.providerId}</strong></td>
            <td>${m.model}</td>
            <td>${m.latencyMs}ms</td>
            <td>${m.totalTokens}</td>
            <td><span class="badge ${m.status}">${m.status}</span></td>
          </tr>`
      )
      .join('');

    const providerCards = allProviders
      .map(
        (p) =>
          `<div class="card ${p.id === activeProvider?.id ? 'active' : ''}">
            <h3>${p.name} ${p.id === activeProvider?.id ? '⭐ (Active)' : ''}</h3>
            <p><strong>Model:</strong> ${p.config.model}</p>
            <p><strong>URL:</strong> ${p.config.baseUrl}</p>
          </div>`
      )
      .join('');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>AG Universal AI — Dashboard</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 24px; color: var(--vscode-foreground); background: var(--vscode-editor-background); }
    h1 { font-size: 1.8rem; margin-bottom: 16px; color: var(--vscode-textLink-foreground); }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px; margin-bottom: 24px; }
    .stat-card { background: var(--vscode-sideBar-background); padding: 16px; borderRadius: 8px; border: 1px solid var(--vscode-widget-border); }
    .stat-card .num { font-size: 1.8rem; font-weight: bold; margin-top: 8px; color: var(--vscode-button-background); }
    .providers-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 16px; margin-bottom: 24px; }
    .card { background: var(--vscode-sideBar-background); padding: 16px; borderRadius: 8px; border: 1px solid var(--vscode-widget-border); }
    .card.active { border-color: var(--vscode-focusBorder); background: var(--vscode-list-activeSelectionBackground); }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; }
    th, td { padding: 10px; text-align: left; border-bottom: 1px solid var(--vscode-widget-border); }
    th { background: var(--vscode-sideBar-background); }
    .badge { padding: 4px 8px; border-radius: 4px; font-size: 0.8rem; font-weight: bold; }
    .badge.success { background: #2e7d32; color: #fff; }
    .badge.error { background: #c62828; color: #fff; }
  </style>
</head>
<body>
  <h1>🚀 AG Universal AI — Dashboard & Telemetry</h1>

  <div class="grid">
    <div class="stat-card"><div>Total Requests</div><div class="num">${totalRequests}</div></div>
    <div class="stat-card"><div>Successful</div><div class="num" style="color: #4caf50">${successCount}</div></div>
    <div class="stat-card"><div>Errors</div><div class="num" style="color: #f44336">${errorCount}</div></div>
    <div class="stat-card"><div>Avg Latency</div><div class="num">${avgLatency}ms</div></div>
    <div class="stat-card"><div>Total Tokens</div><div class="num">${totalTokens.toLocaleString()}</div></div>
  </div>

  <h2>📡 Registered Providers</h2>
  <div class="providers-grid">
    ${providerCards}
  </div>

  <h2>📊 Recent Request Log</h2>
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
    <tbody>
      ${recentLogs || '<tr><td colspan="6">No request telemetry recorded yet. Start using @ag in Chat!</td></tr>'}
    </tbody>
  </table>
</body>
</html>`;
  }
}
