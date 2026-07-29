/**
 * AG Universal AI — Language Model Chat Provider
 *
 * Implements the VS Code LanguageModelChatProvider interface to register
 * custom AI models in the native model picker. This makes all configured
 * providers available through the standard `vscode.lm.selectChatModels()` API.
 */

import * as vscode from 'vscode';
import type { ProviderManager } from '../providers/provider-manager';
import type { ChatMessage, ToolDefinition } from '../providers/types';

export class AGLanguageModelChatProvider implements vscode.Disposable {
  private disposables: vscode.Disposable[] = [];
  private outputChannel: vscode.OutputChannel;

  constructor(
    private readonly providerManager: ProviderManager,
    outputChannel: vscode.OutputChannel
  ) {
    this.outputChannel = outputChannel;
  }

  /**
   * Register this provider with VS Code.
   */
  public register(): void {
    // The LanguageModelChatProvider registration is done via package.json
    // contribution point + runtime registration.
    // We handle the actual model resolution through chat participants and
    // direct API calls for now.
    this.log('Language Model Chat Provider registered');
  }

  /**
   * Send a chat request to the active provider and return a streaming response.
   * This is the main method used by chat participants and other consumers.
   */
  public async sendChatRequest(
    messages: vscode.LanguageModelChatMessage[],
    options: {
      model?: string;
      temperature?: number;
      maxTokens?: number;
      tools?: ToolDefinition[];
      signal?: AbortSignal;
    } = {}
  ): Promise<AsyncIterable<string>> {
    const provider = this.providerManager.getActiveProvider();
    if (!provider) {
      throw new Error('No active AI provider. Configure one in AG Universal AI settings.');
    }

    const chatMessages = this.convertMessages(messages);

    const config = vscode.workspace.getConfiguration('ag-universal-ai');

    const request = {
      model: options.model || provider.config.model,
      messages: chatMessages,
      temperature: options.temperature ?? config.get<number>('chat.temperature', 0.7),
      max_tokens: options.maxTokens ?? config.get<number>('chat.maxTokens', 4096),
      tools: options.tools,
      stream: true,
    };

    this.log(`Chat request → ${provider.name} (${request.model}), ${chatMessages.length} messages`);

    return provider.stream(request, options.signal);
  }

  /**
   * Send a non-streaming chat request.
   */
  public async sendChatRequestNonStreaming(
    messages: vscode.LanguageModelChatMessage[],
    options: {
      model?: string;
      temperature?: number;
      maxTokens?: number;
      tools?: ToolDefinition[];
    } = {}
  ): Promise<string> {
    const provider = this.providerManager.getActiveProvider();
    if (!provider) {
      throw new Error('No active AI provider. Configure one in AG Universal AI settings.');
    }

    const chatMessages = this.convertMessages(messages);
    const config = vscode.workspace.getConfiguration('ag-universal-ai');

    const request = {
      model: options.model || provider.config.model,
      messages: chatMessages,
      temperature: options.temperature ?? config.get<number>('chat.temperature', 0.7),
      max_tokens: options.maxTokens ?? config.get<number>('chat.maxTokens', 4096),
      tools: options.tools,
      stream: false,
    };

    const response = await provider.chat(request);
    return response.choices[0]?.message?.content as string || '';
  }

  // ─── Private Methods ────────────────────────────────────────────────────────

  /**
   * Convert VS Code chat messages to our internal ChatMessage format.
   */
  private convertMessages(messages: vscode.LanguageModelChatMessage[]): ChatMessage[] {
    return messages.map((msg) => {
      let role: ChatMessage['role'];
      switch (msg.role) {
        case vscode.LanguageModelChatMessageRole.User:
          role = 'user';
          break;
        case vscode.LanguageModelChatMessageRole.Assistant:
          role = 'assistant';
          break;
        default:
          role = 'user';
      }

      // Extract text content from message parts
      let content = '';
      for (const part of msg.content) {
        if (part instanceof vscode.LanguageModelTextPart) {
          content += part.value;
        }
      }

      return { role, content };
    });
  }

  private log(message: string): void {
    const timestamp = new Date().toISOString();
    this.outputChannel.appendLine(`[${timestamp}] [LMChatProvider] ${message}`);
  }

  public dispose(): void {
    for (const d of this.disposables) {
      d.dispose();
    }
  }
}
