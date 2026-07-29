/**
 * AG Universal AI — Chat Participant (@ag)
 *
 * Registers the @ag chat participant in VS Code's chat panel.
 * Handles user messages, slash commands, and context references.
 */

import * as vscode from 'vscode';
import type { AGLanguageModelChatProvider } from '../lm/chat-provider';
import type { ProviderManager } from '../providers/provider-manager';
import { buildSystemPrompt, buildSlashCommandPrompt } from './prompt-builder';

const PARTICIPANT_ID = 'ag-universal-ai.chat';

export class AGChatParticipant implements vscode.Disposable {
  private participant: vscode.ChatParticipant | undefined;
  private disposables: vscode.Disposable[] = [];
  private outputChannel: vscode.OutputChannel;

  constructor(
    private readonly lmProvider: AGLanguageModelChatProvider,
    private readonly providerManager: ProviderManager,
    outputChannel: vscode.OutputChannel
  ) {
    this.outputChannel = outputChannel;
  }

  /**
   * Register the chat participant with VS Code.
   */
  public register(): void {
    this.participant = vscode.chat.createChatParticipant(
      PARTICIPANT_ID,
      this.handleRequest.bind(this)
    );

    this.participant.iconPath = new vscode.ThemeIcon('hubot');

    this.disposables.push(this.participant);
    this.log('Chat participant @ag registered');
  }

  // ─── Request Handler ──────────────────────────────────────────────────────

  private async handleRequest(
    request: vscode.ChatRequest,
    context: vscode.ChatContext,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken
  ): Promise<vscode.ChatResult> {
    const activeProvider = this.providerManager.getActiveProvider();

    if (!activeProvider) {
      stream.markdown(
        '⚠️ **No AI provider is configured.** Use the command `AG AI: Switch Provider` to select one.\n\n' +
        'For local inference, install [Ollama](https://ollama.com) and it will be detected automatically.'
      );
      return {};
    }

    try {
      // Build message array
      const messages: vscode.LanguageModelChatMessage[] = [];

      // System prompt
      const systemPrompt = request.command
        ? buildSlashCommandPrompt(request.command)
        : buildSystemPrompt();

      messages.push(vscode.LanguageModelChatMessage.User(systemPrompt));

      // Include conversation history
      for (const turn of context.history) {
        if (turn instanceof vscode.ChatRequestTurn) {
          messages.push(vscode.LanguageModelChatMessage.User(turn.prompt));
        } else if (turn instanceof vscode.ChatResponseTurn) {
          let responseText = '';
          for (const part of turn.response) {
            if (part instanceof vscode.ChatResponseMarkdownPart) {
              responseText += part.value.value;
            }
          }
          if (responseText) {
            messages.push(vscode.LanguageModelChatMessage.Assistant(responseText));
          }
        }
      }

      // Add references context
      const refsContext = await this.buildReferencesContext(request.references);
      if (refsContext) {
        messages.push(vscode.LanguageModelChatMessage.User(refsContext));
      }

      // Add user's current message
      messages.push(vscode.LanguageModelChatMessage.User(request.prompt));

      // Show provider info
      stream.markdown(`*Using **${activeProvider.name}** (${activeProvider.config.model})*\n\n`);

      // Create abort controller linked to cancellation token
      const abortController = new AbortController();
      token.onCancellationRequested(() => abortController.abort());

      // Stream response
      const responseStream = await this.lmProvider.sendChatRequest(messages, {
        signal: abortController.signal,
      });

      for await (const chunk of responseStream) {
        if (token.isCancellationRequested) {break;}
        stream.markdown(chunk);
      }

      return {};
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.log(`Chat error: ${errorMsg}`);

      stream.markdown(
        `\n\n❌ **Error:** ${errorMsg}\n\n` +
        'Try switching providers with `AG AI: Switch Provider` or check your API key.'
      );

      return {};
    }
  }

  // ─── Context Building ─────────────────────────────────────────────────────

  private async buildReferencesContext(
    references: readonly vscode.ChatPromptReference[]
  ): Promise<string | null> {
    if (!references || references.length === 0) {return null;}

    const parts: string[] = ['Here is the referenced context:\n'];

    for (const ref of references) {
      if (ref.value instanceof vscode.Uri) {
        try {
          const doc = await vscode.workspace.openTextDocument(ref.value);
          const content = doc.getText();
          const langId = doc.languageId;
          parts.push(`### File: ${ref.value.fsPath}\n\`\`\`${langId}\n${content}\n\`\`\`\n`);
        } catch {
          parts.push(`### File: ${ref.value.fsPath}\n(Could not read file)\n`);
        }
      } else if (ref.value instanceof vscode.Location) {
        try {
          const doc = await vscode.workspace.openTextDocument(ref.value.uri);
          const content = doc.getText(ref.value.range);
          const langId = doc.languageId;
          parts.push(
            `### Selection from ${ref.value.uri.fsPath} ` +
            `(lines ${ref.value.range.start.line + 1}-${ref.value.range.end.line + 1})\n` +
            `\`\`\`${langId}\n${content}\n\`\`\`\n`
          );
        } catch {
          parts.push(`### Reference: ${ref.id}\n(Could not read)\n`);
        }
      } else if (typeof ref.value === 'string') {
        parts.push(`### Context: ${ref.id}\n${ref.value}\n`);
      }
    }

    return parts.length > 1 ? parts.join('\n') : null;
  }

  private log(message: string): void {
    const timestamp = new Date().toISOString();
    this.outputChannel.appendLine(`[${timestamp}] [ChatParticipant] ${message}`);
  }

  public dispose(): void {
    for (const d of this.disposables) {
      d.dispose();
    }
  }
}
