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
import { PersonaRegistry } from './personas';
import type {
  AgentRunOptions,
  ToolApprovalRequest,
  ToolApprovalDecision,
  ApprovalPolicy,
  DiffPreviewData,
} from './approval';
import { AGDiffProvider } from '../ui/diff-provider';

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
   * @param personaId Optional persona ID to specialize agent behavior
   * @param options Optional configuration and approval callback
   */
  public async run(
    userMessage: string,
    systemPrompt: string,
    stream?: vscode.ChatResponseStream | ((text: string) => void),
    token?: vscode.CancellationToken,
    personaId?: string,
    options?: AgentRunOptions
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

    const effectiveSystemPrompt = personaId
      ? PersonaRegistry.buildSystemPrompt(personaId, systemPrompt)
      : systemPrompt;

    const messages: ChatMessage[] = [
      { role: 'system', content: effectiveSystemPrompt },
      { role: 'user', content: userMessage },
    ];

    const tools = this.toolRegistry.getToolDefinitions();
    const toolCallLog: AgentResult['toolCalls'] = [];
    let iterations = 0;
    let finalResponse = '';

    let useNativeTools = true;
    let fallbackPromptAppended = false;

    const config = vscode.workspace.getConfiguration('ag-universal-ai');
    const approvalPolicy: ApprovalPolicy =
      options?.approvalPolicy ||
      config.get<ApprovalPolicy>('agent.approvalPolicy', 'interactive');
    const alwaysApproveReadOnly =
      options?.alwaysApproveReadOnly ??
      config.get<boolean>('agent.alwaysApproveReadOnly', true);

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

      // Check if there are tool calls (native or extracted from text JSON fallback)
      let toolCalls = assistantMessage.tool_calls;
      if (!toolCalls || toolCalls.length === 0) {
        if (typeof assistantMessage.content === 'string') {
          const extracted = this.extractToolCallsFromText(assistantMessage.content);
          if (extracted.length > 0) {
            toolCalls = extracted as any;
            this.log(`Extracted ${extracted.length} tool call(s) from text response`);
          }
        }
      }

      if (toolCalls && toolCalls.length > 0) {
        emit(`\n🔧 *Executing ${toolCalls.length} tool(s)...*\n\n`);

        for (const toolCall of toolCalls) {
          const toolName = toolCall.function.name;
          let toolArgs: Record<string, unknown> = {};

          try {
            toolArgs = JSON.parse(toolCall.function.arguments);
          } catch {
            toolArgs = { raw: toolCall.function.arguments };
          }

          // Safety / Human-in-the-Loop: check if tool requires approval
          const isMutating = this.isMutatingTool(toolName);
          let requiresApproval = false;

          if (approvalPolicy === 'always') {
            requiresApproval = false;
          } else if (approvalPolicy === 'auto-edit') {
            requiresApproval = toolName === 'ag_runCommand';
          } else {
            // 'interactive'
            if (isMutating) {
              requiresApproval = true;
            } else if (!alwaysApproveReadOnly) {
              requiresApproval = true;
            }
          }

          if (requiresApproval) {
            const { diff, summary } = await this.buildDiffPreview(toolName, toolArgs);
            const approvalReq: ToolApprovalRequest = {
              id: `appr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
              toolName,
              args: toolArgs,
              filePath: typeof toolArgs.path === 'string' ? toolArgs.path : undefined,
              diff,
              summary,
            };

            let decision: ToolApprovalDecision;
            if (options?.onToolApproval) {
              decision = await options.onToolApproval(approvalReq);
            } else {
              decision = await this.confirmActionWithDiff(approvalReq);
            }

            if (decision.action === 'abort') {
              const abortMsg = `Agent execution aborted by user on tool "${toolName}".${decision.reason ? ` Reason: ${decision.reason}` : ''}`;
              emit(`\n⚠️ **${abortMsg}**\n\n`);
              finalResponse += `\n\n${abortMsg}`;
              break;
            }

            if (decision.action === 'skip') {
              const skipMsg = `[Tool Skipped by User] Tool "${toolName}" was declined.${decision.reason ? ` Reason: ${decision.reason}` : ''} Please propose an alternative approach or proceed with remaining tasks.`;
              messages.push({
                role: 'tool',
                content: skipMsg,
                tool_call_id: toolCall.id,
              });
              toolCallLog.push({ name: toolName, args: toolArgs, result: skipMsg });
              emit(`> ⏭️ *Tool \`${toolName}\` declined by user.*\n\n`);
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

  public isMutatingTool(toolName: string): boolean {
    return [
      'ag_writeFile',
      'ag_replaceInFile',
      'ag_multiReplaceInFile',
      'ag_runCommand',
    ].includes(toolName);
  }

  private async buildDiffPreview(
    toolName: string,
    args: Record<string, unknown>
  ): Promise<{ diff?: DiffPreviewData; summary: string }> {
    const filePath = typeof args.path === 'string' ? args.path : undefined;

    if (
      toolName === 'ag_replaceInFile' &&
      filePath &&
      typeof args.targetContent === 'string' &&
      typeof args.replacementContent === 'string'
    ) {
      const preview = await this.toolRegistry.editTools.previewReplace(
        filePath,
        args.targetContent,
        args.replacementContent
      );
      if ('original' in preview && preview.original !== undefined && preview.proposed !== undefined) {
        return {
          diff: {
            filePath,
            originalContent: preview.original,
            proposedContent: preview.proposed,
          },
          summary: `Replace code block in "${filePath}"`,
        };
      }
      return { summary: `Replace code block in "${filePath}"` };
    }

    if (
      toolName === 'ag_multiReplaceInFile' &&
      filePath &&
      Array.isArray(args.replacements)
    ) {
      const preview = await this.toolRegistry.editTools.previewMultiReplace(
        filePath,
        args.replacements as any
      );
      if ('original' in preview && preview.original !== undefined && preview.proposed !== undefined) {
        return {
          diff: {
            filePath,
            originalContent: preview.original,
            proposedContent: preview.proposed,
          },
          summary: `Apply ${args.replacements.length} replacement chunk(s) in "${filePath}"`,
        };
      }
      return { summary: `Apply ${args.replacements.length} replacement chunk(s) in "${filePath}"` };
    }

    if (toolName === 'ag_writeFile' && filePath && typeof args.content === 'string') {
      const preview = await this.toolRegistry.fileTools.previewWriteFile(
        filePath,
        args.content
      );
      if ('original' in preview && preview.original !== undefined && preview.proposed !== undefined) {
        return {
          diff: {
            filePath,
            originalContent: preview.original,
            proposedContent: preview.proposed,
          },
          summary: preview.isNew
            ? `Create new file "${filePath}" (${args.content.split('\n').length} lines)`
            : `Overwrite file "${filePath}"`,
        };
      }
      return { summary: `Write to file "${filePath}"` };
    }

    if (toolName === 'ag_runCommand') {
      const cmd = typeof args.command === 'string' ? args.command : '';
      const cwd = typeof args.cwd === 'string' ? ` in ${args.cwd}` : '';
      return { summary: `Run terminal command: \`${cmd}\`${cwd}` };
    }

    return { summary: `Execute ${toolName}` };
  }

  private async confirmActionWithDiff(
    req: ToolApprovalRequest
  ): Promise<ToolApprovalDecision> {
    const hasDiff = Boolean(req.diff);
    const buttons = hasDiff ? ['Allow', 'Show Diff', 'Skip'] : ['Allow', 'Skip'];

    let chosen = await vscode.window.showWarningMessage(
      `AG AI Agent wants to execute: ${req.summary}`,
      { modal: true },
      ...buttons
    );

    if (chosen === 'Show Diff' && req.diff && req.filePath) {
      const diffProvider = AGDiffProvider.getInstance();
      if (diffProvider) {
        await diffProvider.showDiff(req.filePath, req.diff.proposedContent);
      }
      chosen = await vscode.window.showWarningMessage(
        `Review the proposed diff for ${req.filePath}. Allow AG AI Agent to execute?`,
        { modal: true },
        'Allow',
        'Skip'
      );
    }

    if (chosen === 'Allow') {
      return { action: 'allow' };
    }
    return { action: 'skip', reason: 'User declined in confirmation dialog' };
  }

  private extractToolCallsFromText(
    content: string
  ): Array<{ id: string; function: { name: string; arguments: string } }> {
    if (!content || typeof content !== 'string') {
      return [];
    }

    try {
      // 1. Check for standard {"tool_calls": [...]}
      const toolCallsMatch = content.match(/\{\s*"tool_calls"\s*:\s*\[[\s\S]*?\]\s*\}/);
      if (toolCallsMatch) {
        const parsed = JSON.parse(toolCallsMatch[0]);
        if (Array.isArray(parsed.tool_calls) && parsed.tool_calls.length > 0) {
          return parsed.tool_calls.map((tc: any, i: number) => ({
            id: tc.id || `call_extracted_${Date.now()}_${i}`,
            function: {
              name: tc.function?.name || tc.name,
              arguments:
                typeof tc.function?.arguments === 'string'
                  ? tc.function.arguments
                  : JSON.stringify(tc.function?.arguments || tc.args || {}),
            },
          }));
        }
      }

      // 2. Check for json block ```json ... ``` with tool_calls or function calls
      const jsonBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (jsonBlockMatch) {
        const parsed = JSON.parse(jsonBlockMatch[1]);
        if (parsed.tool_calls && Array.isArray(parsed.tool_calls)) {
          return parsed.tool_calls.map((tc: any, i: number) => ({
            id: tc.id || `call_extracted_${Date.now()}_${i}`,
            function: {
              name: tc.function?.name || tc.name,
              arguments:
                typeof tc.function?.arguments === 'string'
                  ? tc.function.arguments
                  : JSON.stringify(tc.function?.arguments || tc.args || {}),
            },
          }));
        }
        if (parsed.function && parsed.function.name) {
          return [
            {
              id: `call_extracted_${Date.now()}_0`,
              function: {
                name: parsed.function.name,
                arguments:
                  typeof parsed.function.arguments === 'string'
                    ? parsed.function.arguments
                    : JSON.stringify(parsed.function.arguments || {}),
              },
            },
          ];
        }
        if (parsed.name && (parsed.arguments || parsed.args)) {
          return [
            {
              id: `call_extracted_${Date.now()}_0`,
              function: {
                name: parsed.name,
                arguments:
                  typeof (parsed.arguments || parsed.args) === 'string'
                    ? parsed.arguments || parsed.args
                    : JSON.stringify(parsed.arguments || parsed.args || {}),
              },
            },
          ];
        }
      }
    } catch {
      // Ignore JSON parse errors in free-form text
    }

    return [];
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
