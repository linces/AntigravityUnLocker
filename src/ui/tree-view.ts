/**
 * AG Universal AI — Tree View Sidebar Provider
 *
 * Renders the Providers & Metrics tree in the Activity Bar sidebar view.
 */

import * as vscode from 'vscode';
import type { ProviderManager } from '../providers/provider-manager';

export class AGTreeDataProvider implements vscode.TreeDataProvider<AGTreeItem>, vscode.Disposable {
  private _onDidChangeTreeData = new vscode.EventEmitter<AGTreeItem | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private disposables: vscode.Disposable[] = [];

  constructor(private readonly providerManager: ProviderManager) {
    this.disposables.push(
      this.providerManager.onDidChangeProvider(() => this.refresh()),
      this.providerManager.onDidChangeHealth(() => this.refresh())
    );
  }

  public refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: AGTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: AGTreeItem): Promise<AGTreeItem[]> {
    if (!element) {
      // Root items
      const activeId = this.providerManager.getActiveProviderId();
      const activeProvider = this.providerManager.getActiveProvider();

      return [
        new AGTreeItem(
          `Active: ${activeProvider ? activeProvider.name : 'None'}`,
          vscode.TreeItemCollapsibleState.Expanded,
          'active-root',
          new vscode.ThemeIcon('hubot')
        ),
        new AGTreeItem(
          'All Providers',
          vscode.TreeItemCollapsibleState.Expanded,
          'providers-root',
          new vscode.ThemeIcon('server')
        ),
        new AGTreeItem(
          'Metrics & Telemetry',
          vscode.TreeItemCollapsibleState.None,
          'metrics-root',
          new vscode.ThemeIcon('dashboard'),
          {
            command: 'ag-universal-ai.showDashboard',
            title: 'Show Dashboard',
          }
        ),
      ];
    }

    if (element.contextValue === 'active-root') {
      const activeProvider = this.providerManager.getActiveProvider();
      if (!activeProvider) {return [];}

      return [
        new AGTreeItem(
          `Model: ${activeProvider.config.model}`,
          vscode.TreeItemCollapsibleState.None,
          'active-model',
          new vscode.ThemeIcon('symbol-property')
        ),
        new AGTreeItem(
          `Endpoint: ${activeProvider.config.baseUrl}`,
          vscode.TreeItemCollapsibleState.None,
          'active-endpoint',
          new vscode.ThemeIcon('link')
        ),
      ];
    }

    if (element.contextValue === 'providers-root') {
      const activeId = this.providerManager.getActiveProviderId();
      const allProviders = this.providerManager.getAllProviders();
      const items: AGTreeItem[] = [];

      for (const [id, provider] of allProviders) {
        const isActive = id === activeId;
        const label = `${isActive ? '🟢 ' : '⚪ '} ${provider.name}`;
        const item = new AGTreeItem(
          label,
          vscode.TreeItemCollapsibleState.None,
          'provider-item',
          new vscode.ThemeIcon(isActive ? 'check' : 'circle-outline'),
          {
            command: 'ag-universal-ai.switchProvider',
            title: 'Switch Provider',
          }
        );
        item.description = provider.config.model;
        items.push(item);
      }

      return items;
    }

    return [];
  }

  public dispose(): void {
    this._onDidChangeTreeData.dispose();
    for (const d of this.disposables) {
      d.dispose();
    }
  }
}

export class AGTreeItem extends vscode.TreeItem {
  constructor(
    public override readonly label: string,
    public override readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public override readonly contextValue: string,
    iconPath?: vscode.ThemeIcon,
    command?: vscode.Command
  ) {
    super(label, collapsibleState);
    if (iconPath) {this.iconPath = iconPath;}
    if (command) {this.command = command;}
  }
}
