/**
 * AG Universal AI — Embedded MCP Server
 *
 * Implements an embedded Model Context Protocol (MCP) server that exposes
 * workspace tools and resources using JSON-RPC 2.0 protocol over stdio/IPC.
 */

import * as vscode from 'vscode';
import type { ToolRegistry } from '../tools/tool-registry';
import { getMCPToolDefinitions } from './tools';
import { getMCPResources } from './resources';

export interface JSONRPCRequest {
  jsonrpc: '2.0';
  id?: string | number;
  method: string;
  params?: Record<string, unknown>;
}

export interface JSONRPCResponse {
  jsonrpc: '2.0';
  id?: string | number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export class MCPServer implements vscode.Disposable {
  private outputChannel: vscode.OutputChannel;
  private isRunning = false;

  constructor(
    private readonly toolRegistry: ToolRegistry,
    outputChannel: vscode.OutputChannel
  ) {
    this.outputChannel = outputChannel;
  }

  public start(): void {
    this.isRunning = true;
    this.log('Embedded MCP Server started (JSON-RPC 2.0 / MCP Protocol)');
  }

  /**
   * Process an incoming MCP JSON-RPC message.
   */
  public async handleMessage(request: JSONRPCRequest): Promise<JSONRPCResponse> {
    this.log(`Received MCP request: ${request.method}`);

    try {
      switch (request.method) {
        case 'initialize':
          return {
            jsonrpc: '2.0',
            id: request.id,
            result: {
              protocolVersion: '2024-11-05',
              capabilities: {
                tools: {},
                resources: {},
              },
              serverInfo: {
                name: 'ag-universal-ai-mcp',
                version: '0.1.0',
              },
            },
          };

        case 'tools/list':
          return {
            jsonrpc: '2.0',
            id: request.id,
            result: {
              tools: getMCPToolDefinitions(),
            },
          };

        case 'tools/call': {
          const params = request.params as { name: string; arguments?: Record<string, unknown> } | undefined;
          if (!params || !params.name) {
            return this.errorResponse(request.id, -32602, 'Invalid params: name required');
          }

          const resultText = await this.toolRegistry.executeTool(
            params.name,
            params.arguments || {}
          );

          return {
            jsonrpc: '2.0',
            id: request.id,
            result: {
              content: [
                {
                  type: 'text',
                  text: resultText,
                },
              ],
            },
          };
        }

        case 'resources/list': {
          const resources = await getMCPResources();
          return {
            jsonrpc: '2.0',
            id: request.id,
            result: { resources },
          };
        }

        case 'ping':
          return {
            jsonrpc: '2.0',
            id: request.id,
            result: {},
          };

        default:
          return this.errorResponse(request.id, -32601, `Method not found: ${request.method}`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return this.errorResponse(request.id, -32603, `Internal error: ${msg}`);
    }
  }

  private errorResponse(id: string | number | undefined, code: number, message: string): JSONRPCResponse {
    return {
      jsonrpc: '2.0',
      id,
      error: { code, message },
    };
  }

  private log(message: string): void {
    const timestamp = new Date().toISOString();
    this.outputChannel.appendLine(`[${timestamp}] [MCPServer] ${message}`);
  }

  public dispose(): void {
    this.isRunning = false;
    this.log('MCP Server stopped');
  }
}
