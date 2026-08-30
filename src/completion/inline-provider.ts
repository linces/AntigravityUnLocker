/**
 * AG Universal AI — Inline Completion Provider
 *
 * Provides AI-powered "ghost text" inline suggestions as the user types.
 * Uses the active provider with FIM (Fill-in-the-Middle) prompting.
 */

import * as vscode from 'vscode';
import type { ProviderManager } from '../providers/provider-manager';
import {
  buildCompletionContext,
  formatCompletionPrompt,
  buildCompletionSystemPrompt,
} from './context-builder';

const CONFIG_SECTION = 'ag-universal-ai';

export class AGInlineCompletionProvider
  implements vscode.InlineCompletionItemProvider, vscode.Disposable
{
  private disposables: vscode.Disposable[] = [];
  private outputChannel: vscode.OutputChannel;
  private debounceTimer: ReturnType<typeof setTimeout> | undefined;
  private lastRequestId = 0;
  private isProcessing = false;

  // Simple cache: key = prefix hash, value = completion text
  private cache = new Map<string, string>();
  private readonly maxCacheSize = 50;

  constructor(
    private readonly providerManager: ProviderManager,
    outputChannel: vscode.OutputChannel
  ) {
    this.outputChannel = outputChannel;
  }

  /**
   * Register the inline completion provider for all file types.
   */
  public register(context: vscode.ExtensionContext): void {
    const registration = vscode.languages.registerInlineCompletionItemProvider(
      { pattern: '**' },
      this
    );
    context.subscriptions.push(registration);
    this.disposables.push(registration);
    this.log('Inline completion provider registered');
  }

  /**
   * VS Code calls this when it wants inline completion suggestions.
   */
  async provideInlineCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    context: vscode.InlineCompletionContext,
    token: vscode.CancellationToken
  ): Promise<vscode.InlineCompletionItem[] | undefined> {
    // ─── Guard: Check if enabled ──────────────────────────────────────────
    const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
    if (!config.get<boolean>('inlineCompletion.enabled', true)) {
      return undefined;
    }

    // ─── Guard: Check if provider is available ────────────────────────────
    const provider = this.providerManager.getActiveProvider();
    if (!provider) {
      return undefined;
    }

    // ─── Guard: Don't trigger on empty lines or very short context ────────
    const lineText = document.lineAt(position.line).text;
    const textBeforeCursor = lineText.substring(0, position.character).trim();
    if (textBeforeCursor.length < 2) {
      return undefined;
    }

    // ─── Guard: Skip comments-only triggers ───────────────────────────────
    if (textBeforeCursor.startsWith('//') && textBeforeCursor.length < 5) {
      return undefined;
    }

    // ─── Debounce ─────────────────────────────────────────────────────────
    const debounceMs = config.get<number>('inlineCompletion.debounceMs', 300);
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    return new Promise<vscode.InlineCompletionItem[] | undefined>((resolve) => {
      this.debounceTimer = setTimeout(async () => {
        if (token.isCancellationRequested) {
          resolve(undefined);
          return;
        }

        const result = await this.generateCompletion(document, position, token, config);
        resolve(result);
      }, debounceMs);

      // Cancel on token cancellation
      token.onCancellationRequested(() => {
        if (this.debounceTimer) {
          clearTimeout(this.debounceTimer);
        }
        resolve(undefined);
      });
    });
  }

  // ─── Core Completion Logic ────────────────────────────────────────────────

  private async generateCompletion(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken,
    config: vscode.WorkspaceConfiguration
  ): Promise<vscode.InlineCompletionItem[] | undefined> {
    if (this.isProcessing) {
      return undefined;
    }

    const requestId = ++this.lastRequestId;
    this.isProcessing = true;

    try {
      // Build context
      const ctx = buildCompletionContext(document, position);
      const prompt = formatCompletionPrompt(ctx);

      // Check cache
      const cacheKey = this.hashString(prompt.slice(-200));
      const cached = this.cache.get(cacheKey);
      if (cached) {
        this.log('Cache hit for inline completion');
        return [
          new vscode.InlineCompletionItem(
            cached,
            new vscode.Range(position, position)
          ),
        ];
      }

      // Abort if cancelled or superseded
      if (token.isCancellationRequested || requestId !== this.lastRequestId) {
        return undefined;
      }

      // Get provider
      const provider = this.providerManager.getActiveProvider();
      if (!provider) {return undefined;}

      const maxTokens = config.get<number>('inlineCompletion.maxTokens', 256);
      const completionModel = config.get<string>('inlineCompletion.model', '') || provider.config.model;

      // Create abort controller linked to cancellation
      const abortController = new AbortController();
      token.onCancellationRequested(() => abortController.abort());

      // Build messages
      const systemPrompt = buildCompletionSystemPrompt(ctx.languageId);

      const request = {
        model: completionModel,
        messages: [
          { role: 'system' as const, content: systemPrompt },
          { role: 'user' as const, content: `Complete the code at the cursor position:\n\n${prompt}` },
        ],
        temperature: 0.2, // Low temperature for more deterministic completions
        max_tokens: maxTokens,
        stream: false,
        stop: ['\n\n\n', '```', '// ---'],
        signal: abortController.signal,
      };

      const startTime = Date.now();
      const promptChars = systemPrompt.length + prompt.length;

      // Call provider
      try {
        const response = await provider.chat(request);
        const completionText = response.choices[0]?.message?.content;
        const latencyMs = Date.now() - startTime;

        this.providerManager.recordMetric({
          providerId: provider.id,
          model: completionModel,
          isStream: false,
          promptTokens: response.usage?.prompt_tokens || Math.ceil(promptChars / 4),
          completionTokens: response.usage?.completion_tokens || Math.ceil((typeof completionText === 'string' ? completionText.length : 0) / 4),
          latencyMs,
          status: 'success',
        });

        if (
          !completionText ||
          typeof completionText !== 'string' ||
          completionText.trim().length === 0
        ) {
          return undefined;
        }

        // Clean up the completion
        const cleaned = this.cleanCompletion(completionText, ctx);
        if (!cleaned || cleaned.trim().length === 0) {
          return undefined;
        }

        // Verify this request is still the latest
        if (requestId !== this.lastRequestId || token.isCancellationRequested) {
          return undefined;
        }

        // Cache the result
        this.cacheResult(cacheKey, cleaned);

        this.log(`Completion generated: ${cleaned.length} chars`);

        return [
          new vscode.InlineCompletionItem(
            cleaned,
            new vscode.Range(position, position)
          ),
        ];
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.providerManager.recordMetric({
          providerId: provider.id,
          model: completionModel,
          isStream: false,
          promptTokens: Math.ceil(promptChars / 4),
          completionTokens: 0,
          latencyMs: Date.now() - startTime,
          status: 'error',
          errorMessage: msg,
        });
        return undefined;
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        return undefined;
      }
      this.log(`Completion error: ${err instanceof Error ? err.message : String(err)}`);
      return undefined;
    } finally {
      this.isProcessing = false;
    }
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  /**
   * Clean up LLM completion output to be suitable for inline insertion.
   */
  private cleanCompletion(text: string, ctx: { prefix: string }): string {
    let cleaned = text;

    // Remove markdown code fences if the model wraps output
    cleaned = cleaned.replace(/^```[\w]*\n?/gm, '').replace(/\n?```$/gm, '');

    // Remove leading/trailing whitespace-only lines but preserve indentation
    cleaned = cleaned.replace(/^\s*\n/, '');
    cleaned = cleaned.replace(/\n\s*$/, '');

    // If the model repeated the prefix, strip it
    const lastPrefixLine = ctx.prefix.split('\n').pop() || '';
    if (lastPrefixLine.trim().length > 3 && cleaned.startsWith(lastPrefixLine.trim())) {
      cleaned = cleaned.substring(lastPrefixLine.trim().length);
    }

    // Limit to reasonable length (max ~8 lines for inline)
    const lines = cleaned.split('\n');
    if (lines.length > 8) {
      cleaned = lines.slice(0, 8).join('\n');
    }

    return cleaned;
  }

  private cacheResult(key: string, value: string): void {
    if (this.cache.size >= this.maxCacheSize) {
      // Remove oldest entry
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }
    this.cache.set(key, value);
  }

  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash |= 0;
    }
    return hash.toString(36);
  }

  private log(message: string): void {
    const timestamp = new Date().toISOString();
    this.outputChannel.appendLine(`[${timestamp}] [InlineCompletion] ${message}`);
  }

  public dispose(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    for (const d of this.disposables) {
      d.dispose();
    }
  }
}
