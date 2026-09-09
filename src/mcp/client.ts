/**
 * AG Universal AI — Direct MCP Client Engine
 *
 * Connects directly to external Model Context Protocol (MCP) servers over stdio
 * via JSON-RPC 2.0. Discovers external tools and binds them dynamically into the ToolRegistry.
 */

import * as vscode from 'vscode';
import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import type { ToolRegistry } from '../tools/tool-registry';

export interface MCPServerConfig {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  disabled?: boolean;
  transport?: 'stdio' | 'sse';
  url?: string;
  headers?: Record<string, string>;
}

export interface MCPServerStatus {
  id: string;
  status: 'connected' | 'connecting' | 'disconnected' | 'error';
  toolCount: number;
  error?: string;
}

export interface IMCPServerInstance {
  id: string;
  status: MCPServerStatus['status'];
  tools: Array<{ name: string; description: string; inputSchema: Record<string, unknown> }>;
  lastError?: string;
  start(): Promise<void>;
  callTool(name: string, args: Record<string, unknown>): Promise<string>;
  dispose(): void;
}

interface PendingRequest {
  resolve: (result: any) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

class MCPServerProcess implements IMCPServerInstance {
  private process: ChildProcess | undefined;
  private requestId = 0;
  private pendingRequests = new Map<number | string, PendingRequest>();
  private buffer = '';
  public status: MCPServerStatus['status'] = 'disconnected';
  public tools: Array<{ name: string; description: string; inputSchema: Record<string, unknown> }> = [];
  public lastError?: string;

  constructor(
    public readonly id: string,
    public readonly config: MCPServerConfig,
    private readonly outputChannel: vscode.OutputChannel
  ) {}

  public async start(): Promise<void> {
    if (this.config.disabled) {
      this.status = 'disconnected';
      return;
    }

    if (!this.config.command) {
      throw new Error(`MCP stdio server "${this.id}" requires "command" parameter`);
    }

    this.status = 'connecting';
    this.log(`Starting MCP server "${this.id}": ${this.config.command} ${(this.config.args || []).join(' ')}`);

    try {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      const env = {
        ...process.env,
        ...(this.config.env || {}),
      };

      this.process = spawn(this.config.command, this.config.args || [], {
        cwd: workspaceFolder || process.cwd(),
        env,
        shell: process.platform === 'win32',
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      this.process.stdout?.on('data', (data: Buffer) => {
        this.handleData(data.toString('utf-8'));
      });

      this.process.stderr?.on('data', (data: Buffer) => {
        const text = data.toString('utf-8').trim();
        if (text) {
          this.log(`[stderr] ${text}`);
        }
      });

      this.process.on('error', (err) => {
        this.status = 'error';
        this.lastError = err.message;
        this.log(`Process error: ${err.message}`);
      });

      this.process.on('exit', (code, signal) => {
        this.status = 'disconnected';
        this.log(`Process exited with code ${code}, signal ${signal}`);
        this.cleanupPending(new Error(`MCP server "${this.id}" exited (code ${code})`));
      });

      // 1. Initialize Handshake
      await this.sendRequest('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {
          tools: {},
          resources: {},
        },
        clientInfo: {
          name: 'ag-universal-ai-client',
          version: '0.6.0',
        },
      });

      // 2. Notify initialized
      this.sendNotification('notifications/initialized', {});

      // 3. Query available tools
      const toolsResponse = await this.sendRequest('tools/list', {});
      if (toolsResponse && Array.isArray(toolsResponse.tools)) {
        this.tools = toolsResponse.tools;
      }

      this.status = 'connected';
      this.log(`MCP server "${this.id}" connected! ${this.tools.length} tool(s) discovered.`);
    } catch (err: unknown) {
      this.status = 'error';
      this.lastError = err instanceof Error ? err.message : String(err);
      this.log(`Failed to start MCP server "${this.id}": ${this.lastError}`);
      throw err;
    }
  }

  public async callTool(name: string, args: Record<string, unknown>): Promise<string> {
    const response = await this.sendRequest('tools/call', {
      name,
      arguments: args,
    });

    if (response && Array.isArray(response.content)) {
      return response.content
        .map((c: any) => (typeof c === 'string' ? c : c.text || JSON.stringify(c)))
        .join('\n');
    }

    if (typeof response === 'string') {
      return response;
    }

    return JSON.stringify(response);
  }

  public sendRequest(method: string, params: Record<string, unknown>): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.process || !this.process.stdin || this.process.killed) {
        return reject(new Error(`MCP server "${this.id}" is not running`));
      }

      const id = ++this.requestId;
      const message = {
        jsonrpc: '2.0',
        id,
        method,
        params,
      };

      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`MCP request "${method}" (id: ${id}) timed out after 30s`));
      }, 30000);

      this.pendingRequests.set(id, { resolve, reject, timer });

      const payload = JSON.stringify(message) + '\n';
      this.process.stdin.write(payload, 'utf-8', (err) => {
        if (err) {
          clearTimeout(timer);
          this.pendingRequests.delete(id);
          reject(err);
        }
      });
    });
  }

  public sendNotification(method: string, params: Record<string, unknown>): void {
    if (!this.process || !this.process.stdin || this.process.killed) {
      return;
    }

    const message = {
      jsonrpc: '2.0',
      method,
      params,
    };

    this.process.stdin.write(JSON.stringify(message) + '\n', 'utf-8');
  }

  private handleData(chunk: string): void {
    this.buffer += chunk;
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {continue;}

      try {
        const msg = JSON.parse(trimmed);
        if (msg.id !== undefined && this.pendingRequests.has(msg.id)) {
          const pending = this.pendingRequests.get(msg.id)!;
          clearTimeout(pending.timer);
          this.pendingRequests.delete(msg.id);

          if (msg.error) {
            pending.reject(new Error(msg.error.message || `JSON-RPC Error ${msg.error.code}`));
          } else {
            pending.resolve(msg.result);
          }
        }
      } catch {
        // Skip unparseable lines (logs or malformed output)
      }
    }
  }

  private cleanupPending(error: Error): void {
    for (const pending of this.pendingRequests.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pendingRequests.clear();
  }

  public dispose(): void {
    this.cleanupPending(new Error('Server disposing'));
    if (this.process && !this.process.killed) {
      try {
        this.process.kill();
      } catch {
        // ignore
      }
      this.process = undefined;
    }
    this.status = 'disconnected';
  }

  private log(message: string): void {
    const timestamp = new Date().toISOString();
    this.outputChannel.appendLine(`[${timestamp}] [MCPClient:${this.id}] ${message}`);
  }
}

class MCPSSEServerProcess implements IMCPServerInstance {
  private requestId = 0;
  private pendingRequests = new Map<number | string, PendingRequest>();
  private abortController: AbortController | undefined;
  private messageEndpoint: string | undefined;
  public status: MCPServerStatus['status'] = 'disconnected';
  public tools: Array<{ name: string; description: string; inputSchema: Record<string, unknown> }> = [];
  public lastError?: string;

  constructor(
    public readonly id: string,
    public readonly config: MCPServerConfig,
    private readonly outputChannel: vscode.OutputChannel
  ) {}

  public async start(): Promise<void> {
    if (this.config.disabled) {
      this.status = 'disconnected';
      return;
    }

    this.status = 'connecting';

    try {
      if (!this.config.url) {
        throw new Error(`Remote MCP SSE server "${this.id}" requires "url" in config`);
      }

      this.log(`Connecting to remote MCP SSE server "${this.id}" at ${this.config.url}`);

      this.abortController = new AbortController();
      this.messageEndpoint = this.config.url;

      const headers: Record<string, string> = {
        Accept: 'text/event-stream',
        ...(this.config.headers || {}),
      };

      const response = await fetch(this.config.url, {
        method: 'GET',
        headers,
        signal: this.abortController.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }

      // Read SSE stream in background
      this.listenSSE(response);

      // 1. Initialize handshake
      await this.sendRequest('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {
          tools: {},
          resources: {},
        },
        clientInfo: {
          name: 'ag-universal-ai-client',
          version: '0.8.0',
        },
      });

      // 2. Notify initialized
      await this.sendNotification('notifications/initialized', {});

      // 3. Query tools
      const toolsResponse = await this.sendRequest('tools/list', {});
      if (toolsResponse && Array.isArray(toolsResponse.tools)) {
        this.tools = toolsResponse.tools;
      }

      this.status = 'connected';
      this.log(`Remote MCP server "${this.id}" connected via SSE! ${this.tools.length} tool(s) discovered.`);
    } catch (err: unknown) {
      this.status = 'error';
      this.lastError = err instanceof Error ? err.message : String(err);
      this.log(`Failed to connect to remote MCP server "${this.id}": ${this.lastError}`);
      throw err;
    }
  }

  private async listenSSE(response: Response): Promise<void> {
    if (!response.body) {return;}
    try {
      let buffer = '';
      const reader = response.body.getReader ? response.body.getReader() : null;

      if (reader) {
        const decoder = new TextDecoder();
        while (true) {
          const { done, value } = await reader.read();
          if (done) {break;}
          buffer += decoder.decode(value, { stream: true });
          buffer = this.processSSEBuffer(buffer);
        }
      } else if (Symbol.asyncIterator in response.body) {
        for await (const chunk of response.body as any) {
          buffer += typeof chunk === 'string' ? chunk : chunk.toString('utf-8');
          buffer = this.processSSEBuffer(buffer);
        }
      }
    } catch (err: unknown) {
      if (this.status !== 'disconnected') {
        const msg = err instanceof Error ? err.message : String(err);
        this.log(`SSE stream error: ${msg}`);
      }
    }
  }

  private processSSEBuffer(buffer: string): string {
    const lines = buffer.split('\n');
    const remaining = lines.pop() || '';
    let currentEvent = 'message';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        currentEvent = 'message';
        continue;
      }

      if (trimmed.startsWith('event:')) {
        currentEvent = trimmed.slice(6).trim();
      } else if (trimmed.startsWith('data:')) {
        const data = trimmed.slice(5).trim();
        if (currentEvent === 'endpoint') {
          try {
            this.messageEndpoint = new URL(data, this.config.url).toString();
            this.log(`Endpoint updated to: ${this.messageEndpoint}`);
          } catch {
            this.messageEndpoint = data;
          }
        } else {
          this.handleJsonRpcMessage(data);
        }
      }
    }

    return remaining;
  }

  private handleJsonRpcMessage(raw: string): void {
    try {
      const msg = JSON.parse(raw);
      if (msg.id !== undefined && this.pendingRequests.has(msg.id)) {
        const pending = this.pendingRequests.get(msg.id)!;
        clearTimeout(pending.timer);
        this.pendingRequests.delete(msg.id);

        if (msg.error) {
          pending.reject(new Error(msg.error.message || `JSON-RPC Error ${msg.error.code}`));
        } else {
          pending.resolve(msg.result);
        }
      }
    } catch {
      // ignore non-json messages
    }
  }

  public async callTool(name: string, args: Record<string, unknown>): Promise<string> {
    const response = await this.sendRequest('tools/call', {
      name,
      arguments: args,
    });

    if (response && Array.isArray(response.content)) {
      return response.content
        .map((c: any) => (typeof c === 'string' ? c : c.text || JSON.stringify(c)))
        .join('\n');
    }

    if (typeof response === 'string') {
      return response;
    }

    return JSON.stringify(response);
  }

  public async sendRequest(method: string, params: Record<string, unknown>): Promise<any> {
    const targetUrl = this.messageEndpoint || this.config.url!;
    const id = ++this.requestId;
    const body = {
      jsonrpc: '2.0',
      id,
      method,
      params,
    };

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Remote MCP request "${method}" (id: ${id}) timed out after 30s`));
      }, 30000);

      this.pendingRequests.set(id, { resolve, reject, timer });

      fetch(targetUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.config.headers || {}),
        },
        body: JSON.stringify(body),
        signal: this.abortController?.signal,
      })
        .then(async (res) => {
          if (!res.ok) {
            clearTimeout(timer);
            this.pendingRequests.delete(id);
            return reject(new Error(`HTTP POST ${res.status}: ${res.statusText}`));
          }
          const text = await res.text();
          if (text.trim()) {
            try {
              const parsed = JSON.parse(text);
              if (parsed.id === id) {
                clearTimeout(timer);
                this.pendingRequests.delete(id);
                if (parsed.error) {
                  return reject(new Error(parsed.error.message || `JSON-RPC Error ${parsed.error.code}`));
                }
                return resolve(parsed.result);
              }
            } catch {
              // Wait for SSE notification if response is not direct JSON-RPC
            }
          }
        })
        .catch((err) => {
          clearTimeout(timer);
          this.pendingRequests.delete(id);
          reject(err instanceof Error ? err : new Error(String(err)));
        });
    });
  }

  public async sendNotification(method: string, params: Record<string, unknown>): Promise<void> {
    const targetUrl = this.messageEndpoint || this.config.url!;
    const body = {
      jsonrpc: '2.0',
      method,
      params,
    };

    try {
      await fetch(targetUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.config.headers || {}),
        },
        body: JSON.stringify(body),
        signal: this.abortController?.signal,
      });
    } catch (e) {
      this.log(`Failed to send notification ${method}: ${e}`);
    }
  }

  private cleanupPending(error: Error): void {
    for (const pending of this.pendingRequests.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pendingRequests.clear();
  }

  public dispose(): void {
    this.cleanupPending(new Error('Server disposing'));
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = undefined;
    }
    this.status = 'disconnected';
  }

  private log(message: string): void {
    const timestamp = new Date().toISOString();
    this.outputChannel.appendLine(`[${timestamp}] [MCPClientSSE:${this.id}] ${message}`);
  }
}

export class MCPClientManager implements vscode.Disposable {
  private servers = new Map<string, IMCPServerInstance>();
  private disposables: vscode.Disposable[] = [];
  private outputChannel: vscode.OutputChannel;

  constructor(
    private readonly toolRegistry: ToolRegistry,
    outputChannel: vscode.OutputChannel
  ) {
    this.outputChannel = outputChannel;
  }

  /**
   * Initialize and start all configured external MCP servers.
   */
  public async initialize(): Promise<void> {
    this.log('Initializing Direct MCP Client Engine...');
    await this.reloadServers();
  }

  /**
   * Reload configuration and re-bind all MCP servers.
   */
  public async reloadServers(): Promise<void> {
    this.disposeServers();

    const configs = this.loadConfigurations();
    const serverEntries = Object.entries(configs);

    this.log(`Loaded ${serverEntries.length} MCP server configuration(s).`);

    for (const [id, config] of serverEntries) {
      if (config.disabled) {continue;}

      const isSSE = config.transport === 'sse' || (Boolean(config.url) && !config.command);
      const server: IMCPServerInstance = isSSE
        ? new MCPSSEServerProcess(id, config, this.outputChannel)
        : new MCPServerProcess(id, config, this.outputChannel);
      this.servers.set(id, server);

      try {
        await server.start();

        // Register tools into ToolRegistry
        for (const tool of server.tools) {
          const registeredName = `mcp_${id}_${tool.name}`;
          const description = `[MCP: ${id}] ${tool.description || tool.name}`;
          const parameters = (tool.inputSchema as Record<string, unknown>) || { type: 'object', properties: {} };

          const disposable = this.toolRegistry.registerDynamicTool(
            {
              type: 'function',
              function: {
                name: registeredName,
                description,
                parameters,
              },
            },
            async (args) => {
              return await server.callTool(tool.name, args);
            },
            id
          );

          this.disposables.push(disposable);
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.log(`Failed to initialize MCP server "${id}": ${msg}`);
      }
    }
  }

  /**
   * Load configurations from settings and .vscode/mcp.json
   */
  public loadConfigurations(): Record<string, MCPServerConfig> {
    const result: Record<string, MCPServerConfig> = {};

    // 1. VS Code Settings
    const config = vscode.workspace.getConfiguration('ag-universal-ai');
    const settingsServers = config.get<Record<string, MCPServerConfig>>('mcpServers', {});
    Object.assign(result, settingsServers);

    // 2. File: .vscode/mcp.json or .mcp.json in workspace
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders && workspaceFolders.length > 0) {
      const root = workspaceFolders[0].uri.fsPath;
      const filePaths = [
        path.join(root, '.vscode', 'mcp.json'),
        path.join(root, '.mcp.json'),
      ];

      for (const filePath of filePaths) {
        if (fs.existsSync(filePath)) {
          try {
            const raw = fs.readFileSync(filePath, 'utf-8');
            const parsed = JSON.parse(raw);
            const servers = parsed.mcpServers || parsed;
            if (typeof servers === 'object') {
              Object.assign(result, servers);
              this.log(`Loaded MCP servers from ${path.basename(filePath)}`);
            }
          } catch (e) {
            this.log(`Error reading ${filePath}: ${e}`);
          }
        }
      }
    }

    return result;
  }

  /**
   * Get statuses of all active MCP servers.
   */
  public getServerStatuses(): MCPServerStatus[] {
    return [...this.servers.values()].map((s) => ({
      id: s.id,
      status: s.status,
      toolCount: s.tools.length,
      error: s.lastError,
    }));
  }

  private disposeServers(): void {
    for (const [id, server] of this.servers.entries()) {
      this.toolRegistry.unregisterDynamicTools(id);
      server.dispose();
    }
    this.servers.clear();
  }

  private log(message: string): void {
    const timestamp = new Date().toISOString();
    this.outputChannel.appendLine(`[${timestamp}] [MCPClientManager] ${message}`);
  }

  public dispose(): void {
    this.disposeServers();
    for (const d of this.disposables) {
      d.dispose();
    }
  }
}
