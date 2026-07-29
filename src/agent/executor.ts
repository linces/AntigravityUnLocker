/**
 * AG Universal AI — Plan Executor
 *
 * Executes steps of an ExecutionPlan produced by AgentPlanner, tracking step states
 * and feeding progress back to the user/LLM.
 */

import * as vscode from 'vscode';
import type { ToolRegistry } from '../tools/tool-registry';
import type { ExecutionPlan, PlanStep } from './planner';

export class PlanExecutor {
  constructor(private readonly toolRegistry: ToolRegistry) {}

  /**
   * Execute a single step from a plan.
   */
  public async executeStep(
    step: PlanStep,
    contextArgs?: Record<string, unknown>
  ): Promise<string> {
    step.status = 'in_progress';

    if (!step.toolName) {
      step.status = 'completed';
      step.result = 'Step executed conceptually.';
      return step.result;
    }

    try {
      const result = await this.toolRegistry.executeTool(step.toolName, contextArgs || {});
      step.status = 'completed';
      step.result = result;
      return result;
    } catch (err: unknown) {
      step.status = 'failed';
      const msg = err instanceof Error ? err.message : String(err);
      step.result = `Failed: ${msg}`;
      return step.result;
    }
  }

  /**
   * Render plan status as Markdown for display in the chat stream.
   */
  public renderPlanMarkdown(plan: ExecutionPlan): string {
    const lines: string[] = [`### 📋 Execution Plan: ${plan.goal}\n`];
    if (plan.rationale) {
      lines.push(`*Strategy: ${plan.rationale}*\n`);
    }

    for (const s of plan.steps) {
      let icon = '⏳';
      if (s.status === 'in_progress') {icon = '🔄';}
      else if (s.status === 'completed') {icon = '✅';}
      else if (s.status === 'failed') {icon = '❌';}

      lines.push(`${icon} **Step ${s.id}:** ${s.description}`);
    }

    return lines.join('\n');
  }
}
