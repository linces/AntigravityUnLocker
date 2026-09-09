/**
 * AG Universal AI — Human-in-the-Loop Tool Approval Types
 *
 * Defines approval policies, request payloads, and decision protocols
 * for interactive agent actions and inline diff previews.
 */

export type ApprovalPolicy = 'interactive' | 'auto-edit' | 'always';

export interface DiffPreviewData {
  filePath: string;
  originalContent: string;
  proposedContent: string;
}

export interface ToolApprovalRequest {
  id: string;
  toolName: string;
  args: Record<string, unknown>;
  filePath?: string;
  diff?: DiffPreviewData;
  summary: string;
}

export type ToolApprovalDecision =
  | { action: 'allow' }
  | { action: 'skip'; reason?: string }
  | { action: 'abort'; reason?: string };

export interface AgentRunOptions {
  /**
   * Tool approval callback.
   * Invoked whenever a tool requires human confirmation before execution.
   */
  onToolApproval?: (request: ToolApprovalRequest) => Promise<ToolApprovalDecision>;

  /**
   * Override the workspace-level approval policy for this specific run.
   */
  approvalPolicy?: ApprovalPolicy;

  /**
   * If true, tools that only perform read operations are executed automatically without confirmation.
   * Default is true.
   */
  alwaysApproveReadOnly?: boolean;

  /**
   * Current recursion depth in hierarchical subagent delegation (0 = top-level agent).
   */
  currentDepth?: number;

  /**
   * Maximum allowed recursion depth for subagent delegation.
   */
  maxDepth?: number;
}
