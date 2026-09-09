/**
 * AG Universal AI — Subagent Delegation & Swarm Orchestration Manager
 *
 * Enables hierarchical multi-agent delegation where the primary agent (e.g. Supervisor)
 * can delegate isolated missions to specialized subagents (Coder, Security, Reviewer, Planner).
 * Supports both sequential and concurrent/parallel execution with strict context isolation
 * and depth recursion limits.
 */

import * as vscode from 'vscode';
import type { ProviderManager } from '../providers/provider-manager';
import type { ToolRegistry } from '../tools/tool-registry';
import { AgentEngine, AgentResult } from './engine';
import { PersonaRegistry } from './personas';
import type { AgentRunOptions } from './approval';
import type { CheckpointManager } from './checkpoint-manager';

export interface SubagentTaskConfig {
  taskId?: string;
  personaId: 'coder' | 'security' | 'reviewer' | 'planner' | 'supervisor';
  taskDescription: string;
  contextSummary?: string;
  allowedTools?: string[];
  maxIterations?: number;
}

export interface SubagentExecutionResult {
  taskId: string;
  personaId: string;
  personaName: string;
  status: 'success' | 'failed';
  summary: string;
  toolCallsCount: number;
  durationMs: number;
  error?: string;
}

export interface SubagentParallelReport {
  totalTasks: number;
  successfulTasks: number;
  failedTasks: number;
  totalDurationMs: number;
  results: SubagentExecutionResult[];
}

export class SubagentManager implements vscode.Disposable {
  private outputChannel: vscode.OutputChannel;
  private disposables: vscode.Disposable[] = [];
  private checkpointManager?: CheckpointManager;

  constructor(
    private readonly providerManager: ProviderManager,
    private readonly toolRegistry: ToolRegistry,
    outputChannel: vscode.OutputChannel,
    checkpointManager?: CheckpointManager
  ) {
    this.outputChannel = outputChannel;
    this.checkpointManager = checkpointManager;
  }

  public setCheckpointManager(manager: CheckpointManager): void {
    this.checkpointManager = manager;
  }

  /**
   * Run a single isolated subagent task.
   */
  public async runSubagent(
    config: SubagentTaskConfig,
    parentStream?: vscode.ChatResponseStream | ((text: string) => void),
    options?: AgentRunOptions,
    currentDepth = 0
  ): Promise<SubagentExecutionResult> {
    const startTime = Date.now();
    const taskId = config.taskId || `sub_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const persona = PersonaRegistry.get(config.personaId) || PersonaRegistry.getDefault();
    const maxDepth = options?.maxDepth ?? vscode.workspace.getConfiguration('ag-universal-ai').get<number>('agent.maxSubagentDepth', 2);

    this.log(`Invoking subagent [${persona.name}] (Task: ${taskId}) at depth ${currentDepth}/${maxDepth}`);

    // Recursion Guard: Prevent runaway infinite nested subagents
    if (currentDepth >= maxDepth) {
      const depthError = `Delegation blocked: Maximum subagent depth of ${maxDepth} reached.`;
      this.log(`⚠️ ${depthError}`);
      return {
        taskId,
        personaId: persona.id,
        personaName: persona.name,
        status: 'failed',
        summary: depthError,
        toolCallsCount: 0,
        durationMs: Date.now() - startTime,
        error: depthError,
      };
    }

    const emit = (text: string) => {
      if (!parentStream) { return; }
      if (typeof parentStream === 'function') {
        parentStream(text);
      } else if ('markdown' in parentStream && typeof parentStream.markdown === 'function') {
        parentStream.markdown(text);
      }
    };

    emit(`\n${persona.icon} **[Subagent: ${persona.name}]** *Starting isolated task (${taskId}):* ${config.taskDescription}\n\n`);

    // Build isolated system prompt
    let subagentPrompt = `You are an autonomous subagent operating under the ${persona.name} persona (${persona.title}).
Task Mission: ${config.taskDescription}`;

    if (config.contextSummary && config.contextSummary.trim()) {
      subagentPrompt += `\n\nProvided Context / File Reference:\n${config.contextSummary.trim()}`;
    }

    subagentPrompt += `\n\nExecute the assigned task thoroughly using available tools. Be concise, verify edits, and output a structured executive summary when finished.`;

    // Inherit approval policy and increment recursion depth
    const subagentOptions: AgentRunOptions = {
      ...options,
      maxDepth,
      currentDepth: currentDepth + 1,
    };

    try {
      const subEngine = new AgentEngine(this.providerManager, this.toolRegistry, this.outputChannel, this.checkpointManager);
      const result: AgentResult = await subEngine.run(
        config.taskDescription,
        subagentPrompt,
        (chunk: string) => {
          // Stream output with subagent prefix marker if needed
          emit(chunk);
        },
        undefined,
        persona.id,
        subagentOptions
      );

      const durationMs = Date.now() - startTime;
      emit(`\n\n> ✅ **[Subagent: ${persona.name}]** *Completed in ${durationMs}ms (${result.toolCalls.length} tools executed).*\n\n`);

      return {
        taskId,
        personaId: persona.id,
        personaName: persona.name,
        status: 'success',
        summary: result.response,
        toolCallsCount: result.toolCalls.length,
        durationMs,
      };
    } catch (err: unknown) {
      const durationMs = Date.now() - startTime;
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.log(`Subagent [${persona.name}] failed: ${errorMsg}`);
      emit(`\n\n> ❌ **[Subagent: ${persona.name}]** *Failed: ${errorMsg}*\n\n`);

      return {
        taskId,
        personaId: persona.id,
        personaName: persona.name,
        status: 'failed',
        summary: `Subagent execution error: ${errorMsg}`,
        toolCallsCount: 0,
        durationMs,
        error: errorMsg,
      };
    }
  }

  /**
   * Run multiple subagents concurrently in parallel.
   */
  public async runParallelSubagents(
    configs: SubagentTaskConfig[],
    parentStream?: vscode.ChatResponseStream | ((text: string) => void),
    options?: AgentRunOptions,
    currentDepth = 0
  ): Promise<SubagentParallelReport> {
    const startTime = Date.now();
    this.log(`Launching ${configs.length} concurrent subagent tasks in parallel...`);

    const promises = configs.map((cfg) =>
      this.runSubagent(cfg, parentStream, options, currentDepth)
    );

    const outcomes = await Promise.allSettled(promises);
    const results: SubagentExecutionResult[] = outcomes.map((outcome, idx) => {
      if (outcome.status === 'fulfilled') {
        return outcome.value;
      } else {
        const cfg = configs[idx];
        const persona = PersonaRegistry.get(cfg.personaId) || PersonaRegistry.getDefault();
        const err = outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason);
        return {
          taskId: cfg.taskId || `sub_${idx}`,
          personaId: persona.id,
          personaName: persona.name,
          status: 'failed',
          summary: `Promise rejected: ${err}`,
          toolCallsCount: 0,
          durationMs: Date.now() - startTime,
          error: err,
        };
      }
    });

    const successfulTasks = results.filter((r) => r.status === 'success').length;
    const failedTasks = results.filter((r) => r.status === 'failed').length;
    const totalDurationMs = Date.now() - startTime;

    return {
      totalTasks: configs.length,
      successfulTasks,
      failedTasks,
      totalDurationMs,
      results,
    };
  }

  private log(msg: string): void {
    const ts = new Date().toISOString();
    this.outputChannel.appendLine(`[${ts}] [SubagentManager] ${msg}`);
  }

  public dispose(): void {
    this.disposables.forEach((d) => d.dispose());
  }
}
