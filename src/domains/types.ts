/**
 * AG Universal AI — Universal Domain & Rule Engine Types
 *
 * Supports multi-ecosystem directives (.agents, .cursor, .windsurf, Copilot, Claude & Transversal Domains).
 */

export type RuleSource =
  | 'agents'
  | 'cursor'
  | 'windsurf'
  | 'copilot'
  | 'claude'
  | 'transversal-domain';

export interface WorkspaceRule {
  /** Unique rule identifier, typically source:relativePath */
  id: string;
  /** Origin ecosystem */
  source: RuleSource;
  /** Human-readable name or title */
  name: string;
  /** Alias for name */
  title?: string;
  /** File path relative to workspace or transversal repository */
  filePath: string;
  /** Alias for filePath */
  path?: string;
  /** Raw content of the rule instructions */
  content: string;
  /** Optional globs for matching specific files (e.g. Cursor .mdc format) */
  globs?: string[];
  /** Description or summary if available in frontmatter */
  description?: string;
  /** Whether the rule applies unconditionally to all queries */
  alwaysApply: boolean;
  /** Rule precedence weight (higher = evaluated first) */
  priority: number;
}

export interface DomainRuleSummary {
  totalRules: number;
  sourcesFound: Record<RuleSource, number>;
  rules: Array<{
    id: string;
    source: RuleSource;
    name: string;
    filePath: string;
    alwaysApply: boolean;
    hasGlobs: boolean;
  }>;
}
