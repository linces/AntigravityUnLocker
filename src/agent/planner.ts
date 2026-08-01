/**
 * AG Universal AI — Agent Task Planner
 *
 * Implements the Plan-Then-Act pattern: decomposes a complex user prompt
 * into a step-by-step ExecutionPlan before running any tools.
 */

import type { ProviderManager } from '../providers/provider-manager';

export interface PlanStep {
  id: number;
  description: string;
  toolName?: string;
  expectedOutcome: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  result?: string;
}

export interface ExecutionPlan {
  goal: string;
  steps: PlanStep[];
  rationale: string;
}

export class AgentPlanner {
  constructor(private readonly providerManager: ProviderManager) {}

  /**
   * Decompose user goal into a structured step-by-step plan.
   */
  public async createPlan(userGoal: string): Promise<ExecutionPlan> {
    const provider = this.providerManager.getActiveProvider();
    if (!provider) {
      throw new Error('No active AI provider for planning.');
    }

    const systemPrompt = `You are an AI Architecture & Task Planner. Break down the user's coding request into a clear, minimal, step-by-step plan.

Respond strictly in JSON format matching this schema:
{
  "goal": "Summary of the overall goal",
  "rationale": "High-level strategy/approach",
  "steps": [
    {
      "id": 1,
      "description": "Clear action step",
      "toolName": "ag_readFile | ag_writeFile | ag_replaceInFile | ag_multiReplaceInFile | ag_runCommand | ag_searchWorkspace | ag_listFiles",
      "expectedOutcome": "What this step accomplishes"
    }
  ]
}`;

    try {
      const response = await provider.chat({
        model: provider.config.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userGoal },
        ],
        temperature: 0.2,
        stream: false,
      });

      const rawContent = response.choices[0]?.message?.content;
      const text = typeof rawContent === 'string' ? rawContent : '';
      const cleanJson = text.replace(/^```json/g, '').replace(/```$/g, '').trim();
      const parsed = JSON.parse(cleanJson);

      return {
        goal: parsed.goal || userGoal,
        rationale: parsed.rationale || '',
        steps: (parsed.steps || []).map((s: any, idx: number) => ({
          id: s.id || idx + 1,
          description: s.description || '',
          toolName: s.toolName,
          expectedOutcome: s.expectedOutcome || '',
          status: 'pending' as const,
        })),
      };
    } catch {
      // Fallback plan if JSON parsing fails
      return {
        goal: userGoal,
        rationale: 'Direct execution fallback plan',
        steps: [
          {
            id: 1,
            description: 'Analyze workspace and execute user request',
            expectedOutcome: 'Fulfill user goal',
            status: 'pending',
          },
        ],
      };
    }
  }
}
