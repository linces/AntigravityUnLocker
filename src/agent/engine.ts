/**
 * AG Universal AI — Agent Engine
 *
 * Implements the agentic loop: prompt → LLM → tool calls → execution → feedback → LLM
 * With safety guards, iteration limits, and user confirmation for destructive actions.
 */

import * as vscode from 'vscode';
import type { ProviderManager } from '../providers/provider-manager';
import type { ToolRegistry } from '../tools/tool-registry';
import type { ChatMessage } from '../providers/types';

const MAX_ITERATIONS = 10;

export interface AgentResult {
  response: string;
  toolCalls: Array<{ name: string; args: Record<string, unknown>; result: string }>;
  iterations: number;
}

export class AgentEngine implements vscode.Disposable {
  private disposables: vscode.Disposable[] = [];
  private outputChannel: vscode.OutputChannel;

  constructor(
    private readonly providerManager: ProviderManager,
    private readonly toolRegistry: ToolRegistry,
    outputChannel: vscode.OutputChannel
  ) {
    this.outputChannel = outputChannel;
  }

  /**
   * Run an agentic loop: the LLM can call tools iteratively until it produces a final answer.
   *
   * @param userMessage The user's request
   * @param systemPrompt The system prompt context
   * @param stream Optional stream to send intermediate progress to the chat UI
   * @param token Cancellation token
   */
  public async run(
    userMessage: string,
    systemPrompt: string,
    stream?: vscode.ChatResponseStream | ((text: string) => void),
    token?: vscode.CancellationToken
  ): Promise<AgentResult> {
    const provider = this.providerManager.getActiveProvider();
    if (!provider) {
      throw new Error('No active AI provider configured.');
    }

    const emit = (text: string) => {
      if (!stream) { return; }
      if (typeof stream === 'function') {
        stream(text);
      } else if ('markdown' in stream && typeof stream.markdown === 'function') {
        stream.markdown(text);
      }
    };

    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ];

    const tools = this.toolRegistry.getToolDefinitions();
    const toolCallLog: AgentResult['toolCalls'] = [];
    let iterations = 0;
    let finalResponse = '';

    let useNativeTools = true;
    let fallbackPromptAppended = false;

    while (iterations < MAX_ITERATIONS) {
      iterations++;

      if (token?.isCancellationRequested) {
        this.log('Agent loop cancelled by user');
        break;
      }

      this.log(`Agent iteration ${iterations}/${MAX_ITERATIONS}`);

      let response;
      if (useNativeTools) {
        try {
          response = await provider.chat({
            model: provider.config.model,
            messages,
            tools,
            tool_choice: 'auto',
            temperature: 0.3,
            stream: false,
          });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          this.log(`Native tool payload rejected by ${provider.name}: ${msg}. Retrying without native tools payload...`);
          useNativeTools = false;
        }
      }

      if (!response) {
        if (!fallbackPromptAppended && messages[0] && messages[0].role === 'system') {
          messages[0].content += `\n\nAvailable Tools:\n${JSON.stringify(tools, null, 2)}\nTo call a tool, reply with JSON: {"tool_calls":[{"function":{"name":"tool_name","arguments":"{...}"}}]}`;
          fallbackPromptAppended = true;
        }

        response = await provider.chat({
          model: provider.config.model,
          messages,
          temperature: 0.3,
          stream: false,
        });
      }

      const choice = response.choices[0];
      if (!choice) {
        this.log('No choice returned from LLM');
        break;
      }

      const assistantMessage = choice.message;

      // Add assistant response to history
      messages.push(assistantMessage);

      // Check if there are tool calls
      if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
        emit(`\n🔧 *Executing ${assistantMessage.tool_calls.length} tool(s)...*\n\n`);

        for (const toolCall of assistantMessage.tool_calls) {
          const toolName = toolCall.function.name;
          let toolArgs: Record<string, unknown> = {};

          try {
            toolArgs = JSON.parse(toolCall.function.arguments);
          } catch {
            toolArgs = { raw: toolCall.function.arguments };
          }

          // Safety: confirm destructive actions if running in ChatResponseStream mode
          if (this.isDestructive(toolName) && stream && typeof stream !== 'function') {
            const confirmed = await this.confirmAction(toolName, toolArgs);
            if (!confirmed) {
              const skipMsg = `Tool "${toolName}" skipped by user.`;
              messages.push({
                role: 'tool',
                content: skipMsg,
                tool_call_id: toolCall.id,
              });
              toolCallLog.push({ name: toolName, args: toolArgs, result: skipMsg });
              continue;
            }
          }

          // Execute the tool
          emit(`> \`${toolName}\`(${this.summarizeArgs(toolArgs)})\n`);

          const result = await this.toolRegistry.executeTool(toolName, toolArgs);

          const isErrorResult = result.startsWith('Error') || result.includes('SyntaxError') || result.includes('TS2339');

          // Self-Correction Harness: inject reflection guidance on error
          const formattedResult = isErrorResult
            ? `[Self-Correction Harness Notice: Tool execution failed]\n${result}\n\nPlease analyze the root cause of this error, review your file context or parameters, and call the appropriate tool to fix the issue.`
            : result;

          // Add tool result to conversation
          messages.push({
            role: 'tool',
            content: formattedResult,
            tool_call_id: toolCall.id,
          });

          toolCallLog.push({ name: toolName, args: toolArgs, result });

          // Show result
          if (isErrorResult) {
            emit(`> ⚠️ **Error:** ${result.length > 200 ? result.substring(0, 200) + '...' : result}\n> 💡 *Self-Correction Harness activated. Retrying with diagnostic reflection...*\n\n`);
          } else {
            const preview = result.length > 200 ? result.substring(0, 200) + '...' : result;
            emit(`> ✅ ${preview}\n\n`);
          }
        }

        // Continue the loop — LLM needs to process tool results
        continue;
      }

      // No tool calls — this is the final response
      finalResponse = typeof assistantMessage.content === 'string'
        ? assistantMessage.content
        : '';

      if (finalResponse) {
        emit(finalResponse);
      }

      break;
    }

    if (!finalResponse && toolCallLog.length > 0) {
      finalResponse = `✅ Execution complete. ${toolCallLog.length} action(s) performed successfully:\n` +
        toolCallLog.map((t) => `- \`${t.name}\`: ${t.result.length > 100 ? t.result.substring(0, 100) + '...' : t.result}`).join('\n');
    }

    if (iterations >= MAX_ITERATIONS) {
      const limitMsg = `\n\n⚠️ Agent reached maximum iterations (${MAX_ITERATIONS}). Stopping.`;
      finalResponse += limitMsg;
      emit(limitMsg);
    }

    this.log(`Agent completed: ${iterations} iterations, ${toolCallLog.length} tool calls`);

    return {
      response: finalResponse,
      toolCalls: toolCallLog,
      iterations,
    };
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  private isDestructive(toolName: string): boolean {
    return ['ag_writeFile', 'ag_replaceInFile', 'ag_multiReplaceInFile', 'ag_runCommand'].includes(toolName);
  }

  private async confirmAction(
    toolName: string,
    args: Record<string, unknown>
  ): Promise<boolean> {
    const detail =
      toolName === 'ag_writeFile'
        ? `Write to file: ${args.path}`
        : `Run command: ${args.command}`;

    const result = await vscode.window.showWarningMessage(
      `AG AI Agent wants to: ${detail}`,
      { modal: true },
      'Allow',
      'Skip'
    );

    return result === 'Allow';
  }

  private summarizeArgs(args: Record<string, unknown>): string {
    const entries = Object.entries(args);
    if (entries.length === 0) {return '';}

    return entries
      .map(([key, value]) => {
        const strValue = typeof value === 'string' ? value : JSON.stringify(value);
        const truncated =
          strValue.length > 40 ? strValue.substring(0, 37) + '...' : strValue;
        return `${key}: "${truncated}"`;
      })
      .join(', ');
  }

  private log(message: string): void {
    const timestamp = new Date().toISOString();
    this.outputChannel.appendLine(`[${timestamp}] [AgentEngine] ${message}`);
  }

  public dispose(): void {
    for (const d of this.disposables) {
      d.dispose();
    }
  }
}
