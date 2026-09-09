/**
 * AG Universal AI — Universal Domain & Rule Engine
 *
 * Automatically discovers, parses, and aggregates project rules and domain directives
 * across modern AI ecosystems (.agents, .cursor, .windsurf, Copilot, Claude & Transversal Domains).
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import type { WorkspaceRule, RuleSource, DomainRuleSummary } from './types';

export class DomainRulesManager implements vscode.Disposable {
  private rules: WorkspaceRule[] = [];
  private disposables: vscode.Disposable[] = [];
  private outputChannel: vscode.OutputChannel;
  private isInitialized = false;

  constructor(outputChannel: vscode.OutputChannel) {
    this.outputChannel = outputChannel;
  }

  /**
   * Initialize discovery and register workspace filesystem watchers.
   */
  public async initialize(): Promise<void> {
    this.log('Initializing Universal Domain & Rule Engine...');
    await this.discoverRules();
    this.registerWatchers();
    this.isInitialized = true;
  }

  /**
   * Scan active workspace and transversal repository to discover all rules.
   */
  public async discoverRules(): Promise<WorkspaceRule[]> {
    const discovered: WorkspaceRule[] = [];
    const workspaceFolders = vscode.workspace.workspaceFolders;

    if (workspaceFolders && workspaceFolders.length > 0) {
      const rootFolder = workspaceFolders[0];
      const rootUri = rootFolder.uri;

      // 1. Antigravity / AGY / Gemini Ecosystem (.agents, .gemini)
      await this.scanFile(rootUri, '.agents/AGENTS.md', 'agents', 100, discovered);
      await this.scanFile(rootUri, 'AGENTS.md', 'agents', 95, discovered);
      await this.scanDir(rootUri, '.agents/rules', ['.md'], 'agents', 90, discovered);
      await this.scanFile(rootUri, '.gemini/GEMINI.md', 'agents', 85, discovered);
      await this.scanFile(rootUri, 'GEMINI.md', 'agents', 80, discovered);

      // 2. Cursor Ecosystem (.cursor, .cursorrules)
      await this.scanFile(rootUri, '.cursorrules', 'cursor', 90, discovered);
      await this.scanDir(rootUri, '.cursor/rules', ['.md', '.mdc'], 'cursor', 85, discovered);

      // 3. Windsurf / Codeium Ecosystem (.windsurf, .windsurfrules)
      await this.scanFile(rootUri, '.windsurfrules', 'windsurf', 80, discovered);
      await this.scanDir(rootUri, '.windsurf/rules', ['.md'], 'windsurf', 75, discovered);

      // 4. GitHub Copilot Ecosystem (.github/copilot-instructions.md)
      await this.scanFile(rootUri, '.github/copilot-instructions.md', 'copilot', 70, discovered);

      // 5. Claude Code / Anthropic Ecosystem (CLAUDE.md)
      await this.scanFile(rootUri, 'CLAUDE.md', 'claude', 65, discovered);
      await this.scanDir(rootUri, '.claude/rules', ['.md'], 'claude', 60, discovered);
    }

    // 6. Transversal Domain Repository (if configured in VS Code settings)
    await this.scanTransversalDomain(discovered);

    // Deduplicate by ID and sort by priority descending
    const seen = new Set<string>();
    this.rules = discovered.filter((r) => {
      if (seen.has(r.id)) { return false; }
      seen.add(r.id);
      return true;
    }).sort((a, b) => b.priority - a.priority);

    this.log(`Discovered ${this.rules.length} active project & domain rule(s).`);
    return this.rules;
  }

  /**
   * Aggregate active rules into a consolidated Markdown prompt section.
   */
  public getAggregatedRulesPrompt(activeFilePath?: string): string {
    if (this.rules.length === 0) {
      return '';
    }

    const applicableRules = this.getActiveRules(activeFilePath);
    if (applicableRules.length === 0) {
      return '';
    }

    const sections: string[] = [
      '# 🏛️ ACTIVE WORKSPACE & DOMAIN RULES (Enforced Project Guidelines)',
      'The following rules are strictly enforced for this workspace across all actions and code modifications:',
      '',
    ];

    for (const r of applicableRules) {
      const header = `### 📜 [RULE SOURCE: ${r.source.toUpperCase()}] ${r.name} (${r.filePath})`;
      let body = r.content.trim();

      // Guard against astronomical rule file sizes
      if (body.length > 12000) {
        body = body.substring(0, 12000) + '\n\n... [Content truncated for context window efficiency]';
      }

      sections.push(header);
      sections.push(body);
      sections.push('');
    }

    return sections.join('\n');
  }

  /**
   * Alias for getAggregatedRulesPrompt.
   */
  public buildSystemRulesPrompt(activeFilePath?: string): string {
    return this.getAggregatedRulesPrompt(activeFilePath);
  }

  /**
   * Get all active rules, optionally filtered by the active file path.
   */
  public getActiveRules(activeFilePath?: string): WorkspaceRule[] {
    if (!activeFilePath) {
      return [...this.rules];
    }

    return this.rules.filter((rule) => {
      if (rule.alwaysApply) {
        return true;
      }
      if (rule.globs && rule.globs.length > 0) {
        return this.matchesAnyGlob(activeFilePath, rule.globs);
      }
      return true;
    });
  }

  /**
   * Return all discovered rules.
   */
  public getAllRules(): WorkspaceRule[] {
    return [...this.rules];
  }

  /**
   * Get formatted summary of all active rules for UI inspection or /rules slash command.
   */
  public getRuleSummary(): DomainRuleSummary {
    const sourcesFound: Record<RuleSource, number> = {
      agents: 0,
      cursor: 0,
      windsurf: 0,
      copilot: 0,
      claude: 0,
      'transversal-domain': 0,
    };

    for (const r of this.rules) {
      sourcesFound[r.source] = (sourcesFound[r.source] || 0) + 1;
    }

    return {
      totalRules: this.rules.length,
      sourcesFound,
      rules: this.rules.map((r) => ({
        id: r.id,
        source: r.source,
        name: r.name,
        filePath: r.filePath,
        alwaysApply: r.alwaysApply,
        hasGlobs: Boolean(r.globs && r.globs.length > 0),
      })),
    };
  }

  /**
   * Compatibility summary for extension command and tests.
   */
  public getSummary(): {
    totalRules: number;
    activeSources: RuleSource[];
    sources: Record<RuleSource, number>;
    rules: {
      id: string;
      source: RuleSource;
      name: string;
      filePath: string;
      alwaysApply: boolean;
      hasGlobs: boolean;
    }[];
  } {
    const s = this.getRuleSummary();
    const activeSources = (Object.keys(s.sourcesFound) as RuleSource[]).filter(
      (src) => s.sourcesFound[src] > 0
    );
    return {
      totalRules: s.totalRules,
      activeSources,
      sources: s.sourcesFound,
      rules: s.rules,
    };
  }

  /**
   * Render human-readable summary in Markdown for chat display.
   */
  public renderMarkdownSummary(): string {
    const summary = this.getRuleSummary();
    if (summary.totalRules === 0) {
      return 'ℹ️ **No custom workspace rules detected.**\n\n' +
        'You can define rules in any of the following standard locations:\n' +
        '- `.agents/AGENTS.md` or `AGENTS.md` (Antigravity standard)\n' +
        '- `.cursorrules` or `.cursor/rules/*.mdc` (Cursor standard)\n' +
        '- `.windsurfrules` or `.windsurf/rules/*.md` (Windsurf standard)\n' +
        '- `.github/copilot-instructions.md` (Copilot standard)\n' +
        '- `CLAUDE.md` (Claude standard)';
    }

    const lines: string[] = [
      `### 🏛️ Active Workspace Rules & Domains (${summary.totalRules} detected)\n`,
      '| Source | Rule Name | File Path | Scope |',
      '| :--- | :--- | :--- | :--- |',
    ];

    for (const r of summary.rules) {
      let icon = '📜';
      if (r.source === 'agents') { icon = '🤖'; }
      else if (r.source === 'cursor') { icon = '⚡'; }
      else if (r.source === 'windsurf') { icon = '🏄'; }
      else if (r.source === 'copilot') { icon = '🐙'; }
      else if (r.source === 'claude') { icon = '🧠'; }
      else if (r.source === 'transversal-domain') { icon = '🌐'; }

      const scope = r.alwaysApply ? 'Global (All queries)' : (r.hasGlobs ? 'Pattern-matched (Globs)' : 'Standard');
      lines.push(`| ${icon} **${r.source}** | \`${r.name}\` | \`${r.filePath}\` | ${scope} |`);
    }

    lines.push('\n*All rules above are automatically loaded and applied to Chat, Agents, and Tools.*');
    return lines.join('\n');
  }

  // ─── Private Scanning Helpers ──────────────────────────────────────────────

  private async scanFile(
    rootUri: vscode.Uri,
    relPath: string,
    source: RuleSource,
    priority: number,
    out: WorkspaceRule[]
  ): Promise<void> {
    const fileUri = vscode.Uri.joinPath(rootUri, relPath);

    // 1. Try VS Code workspace filesystem API first
    try {
      if (vscode.workspace?.fs?.readFile) {
        try {
          const stat = await vscode.workspace.fs.stat(fileUri);
          if ((stat.type & vscode.FileType.File) !== 0) {
            const data = await vscode.workspace.fs.readFile(fileUri);
            const raw = new TextDecoder('utf-8').decode(data);
            if (raw.trim()) {
              const parsed = this.parseRuleFile(raw, relPath, source, priority);
              out.push(parsed);
              this.log(`Loaded rule: [${source}] ${relPath}`);
              return;
            }
          }
        } catch {
          // File not found in workspace.fs, check fallback below
        }
      }
    } catch {
      // Pass through
    }

    // 2. Node fs fallback
    const fullPath = fileUri.fsPath || path.join(rootUri.fsPath || '', relPath);
    if (!fs.existsSync(fullPath)) {
      return;
    }

    try {
      const stats = fs.statSync(fullPath);
      if (!stats.isFile()) { return; }

      const raw = fs.readFileSync(fullPath, 'utf-8');
      if (!raw.trim()) { return; }

      const parsed = this.parseRuleFile(raw, relPath, source, priority);
      out.push(parsed);
      this.log(`Loaded rule: [${source}] ${relPath}`);
    } catch (e) {
      this.log(`Error reading rule file ${relPath}: ${e}`);
    }
  }

  private async scanDir(
    rootUri: vscode.Uri,
    relDir: string,
    extensions: string[],
    source: RuleSource,
    priority: number,
    out: WorkspaceRule[]
  ): Promise<void> {
    const dirUri = vscode.Uri.joinPath(rootUri, relDir);

    // 1. Try VS Code workspace filesystem API
    try {
      if (vscode.workspace?.fs?.readDirectory) {
        try {
          const stat = await vscode.workspace.fs.stat(dirUri);
          if ((stat.type & vscode.FileType.Directory) !== 0) {
            const entries = await vscode.workspace.fs.readDirectory(dirUri);
            for (const [entryName, fileType] of entries) {
              if ((fileType & vscode.FileType.File) !== 0) {
                const ext = path.extname(entryName).toLowerCase();
                if (extensions.includes(ext)) {
                  const relPath = `${relDir}/${entryName}`.replace(/\\/g, '/');
                  await this.scanFile(rootUri, relPath, source, priority, out);
                }
              }
            }
            return;
          }
        } catch {
          // Directory not found in workspace.fs
        }
      }
    } catch {
      // Pass through
    }

    // 2. Node fs fallback
    const fullDir = dirUri.fsPath || path.join(rootUri.fsPath || '', relDir);
    if (!fs.existsSync(fullDir)) {
      return;
    }

    try {
      const stats = fs.statSync(fullDir);
      if (!stats.isDirectory()) { return; }

      const entries = fs.readdirSync(fullDir);
      for (const entry of entries) {
        const ext = path.extname(entry).toLowerCase();
        if (extensions.includes(ext)) {
          const relPath = path.join(relDir, entry).replace(/\\/g, '/');
          await this.scanFile(rootUri, relPath, source, priority, out);
        }
      }
    } catch (e) {
      this.log(`Error scanning rule directory ${relDir}: ${e}`);
    }
  }

  private async scanTransversalDomain(out: WorkspaceRule[]): Promise<void> {
    const config = vscode.workspace.getConfiguration('ag-universal-ai');
    let domainRepo = config.get<string>('domainRepositoryPath');

    // Default transversal domain path fallback if standard location exists
    if (!domainRepo) {
      const fallbackPath = 'E:\\00Dev\\agent skills e mais prod';
      if (fs.existsSync(fallbackPath)) {
        domainRepo = fallbackPath;
      }
    }

    if (!domainRepo || !fs.existsSync(domainRepo)) {
      return;
    }

    try {
      this.log(`Scanning transversal domain repository: ${domainRepo}`);
      const rulesDir = path.join(domainRepo, 'rules');
      if (fs.existsSync(rulesDir)) {
        const entries = fs.readdirSync(rulesDir);
        for (const entry of entries) {
          if (entry.endsWith('.md')) {
            const full = path.join(rulesDir, entry);
            const content = fs.readFileSync(full, 'utf-8');
            out.push({
              id: `domain:${entry}`,
              source: 'transversal-domain',
              name: `Domain Rule: ${entry.replace(/\.md$/, '')}`,
              title: `Domain Rule: ${entry.replace(/\.md$/, '')}`,
              filePath: `[DomainRepo]/rules/${entry}`,
              path: `[DomainRepo]/rules/${entry}`,
              content,
              alwaysApply: false,
              priority: 70,
            });
          }
        }
      }
    } catch (e) {
      this.log(`Error scanning transversal domain: ${e}`);
    }
  }

  /**
   * Parse frontmatter for Cursor .mdc / markdown rules and extract metadata.
   */
  private parseRuleFile(
    raw: string,
    relPath: string,
    source: RuleSource,
    priority: number
  ): WorkspaceRule {
    let content = raw;
    let description: string | undefined;
    let globs: string[] | undefined;
    let alwaysApply = true;

    // Check for YAML Frontmatter (e.g. Cursor .mdc format)
    if (raw.startsWith('---')) {
      const endMatch = raw.indexOf('\n---', 3);
      if (endMatch > 0) {
        const frontmatter = raw.substring(3, endMatch).trim();
        content = raw.substring(endMatch + 4).trim();

        // Extract description
        const descMatch = frontmatter.match(/description:\s*([^\n]+)/i);
        if (descMatch) {
          description = descMatch[1].trim().replace(/^["']|["']$/g, '');
        }

        // Extract globs
        const globsMatch = frontmatter.match(/globs:\s*([^\n]+)/i);
        if (globsMatch) {
          const val = globsMatch[1].trim();
          if (val.startsWith('[') && val.endsWith(']')) {
            try {
              globs = JSON.parse(val.replace(/'/g, '"'));
            } catch {
              globs = val.substring(1, val.length - 1).split(',').map((s) => s.trim().replace(/^["']|["']$/g, ''));
            }
          } else {
            globs = val.split(',').map((s) => s.trim());
          }
          alwaysApply = false;
        }

        // Extract alwaysApply flag
        const applyMatch = frontmatter.match(/alwaysApply:\s*(true|false)/i);
        if (applyMatch) {
          alwaysApply = applyMatch[1].toLowerCase() === 'true';
        }
      }
    }

    const name = path.basename(relPath);

    return {
      id: `${source}:${relPath}`,
      source,
      name,
      title: name,
      filePath: relPath,
      path: relPath,
      content,
      description,
      globs,
      alwaysApply,
      priority,
    };
  }

  private matchesAnyGlob(filePath: string, globs: string[]): boolean {
    const norm = filePath.replace(/\\/g, '/');
    const base = path.basename(norm);

    for (const glob of globs) {
      const cleanGlob = glob.trim();
      if (!cleanGlob) { continue; }

      // Basename match for simple filename globs (e.g. *.ts, *.tsx)
      if (!cleanGlob.includes('/')) {
        const baseRegexStr = '^' + cleanGlob
          .replace(/\./g, '\\.')
          .replace(/\*/g, '[^/]*') + '$';
        try {
          if (new RegExp(baseRegexStr).test(base)) {
            return true;
          }
        } catch {
          if (base.endsWith(cleanGlob.replace('*', ''))) { return true; }
        }
      }

      // Path-aware glob match (handles ** and nested subdirectories)
      const pattern = cleanGlob
        .replace(/\./g, '\\.')
        .replace(/\/\*\*\//g, '/(?:.*/)?')
        .replace(/\/\*\*/g, '(?:/.*)?')
        .replace(/\*\*\//g, '(?:.*/)?')
        .replace(/\*/g, '[^/]*');

      const regexStr = cleanGlob.startsWith('/')
        ? `^${pattern}$`
        : `(?:^|/)${pattern}$`;

      try {
        const regex = new RegExp(regexStr);
        if (regex.test(norm)) {
          return true;
        }
      } catch {
        if (norm.includes(cleanGlob) || base === cleanGlob) { return true; }
      }
    }
    return false;
  }

  private registerWatchers(): void {
    try {
      const patterns = [
        '**/.agents/**',
        '**/AGENTS.md',
        '**/.cursorrules',
        '**/.cursor/rules/**',
        '**/.windsurfrules',
        '**/.windsurf/rules/**',
        '**/.github/copilot-instructions.md',
        '**/CLAUDE.md',
      ];

      for (const pattern of patterns) {
        const watcher = vscode.workspace.createFileSystemWatcher(pattern);
        let debounceTimer: NodeJS.Timeout | undefined;
        const triggerReload = () => {
          if (debounceTimer) { clearTimeout(debounceTimer); }
          debounceTimer = setTimeout(() => {
            this.log(`Detected change in rule files (${pattern}). Reloading rules...`);
            this.discoverRules();
          }, 500);
        };

        watcher.onDidCreate(triggerReload);
        watcher.onDidChange(triggerReload);
        watcher.onDidDelete(triggerReload);

        this.disposables.push(watcher);
      }
    } catch (e) {
      this.log(`Failed to register rule watchers: ${e}`);
    }
  }

  private log(message: string): void {
    const timestamp = new Date().toISOString();
    this.outputChannel.appendLine(`[${timestamp}] [DomainRules] ${message}`);
  }

  public dispose(): void {
    for (const d of this.disposables) {
      d.dispose();
    }
    this.rules = [];
  }
}
