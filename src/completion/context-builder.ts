/**
 * AG Universal AI — Context Builder for Inline Completion
 *
 * Assembles the prompt context for Fill-in-the-Middle (FIM) completions
 * by extracting prefix, suffix, imports, and surrounding file context.
 */

import * as vscode from 'vscode';

export interface CompletionContext {
  prefix: string;
  suffix: string;
  languageId: string;
  filePath: string;
  lineNumber: number;
  column: number;
  imports: string;
  relatedContext: string;
}

/**
 * Build completion context from the current document and cursor position.
 */
export function buildCompletionContext(
  document: vscode.TextDocument,
  position: vscode.Position
): CompletionContext {
  const maxPrefixLines = 60;
  const maxSuffixLines = 30;

  // ─── Prefix (code before cursor) ─────────────────────────────────────────
  const prefixStartLine = Math.max(0, position.line - maxPrefixLines);
  const prefixRange = new vscode.Range(
    new vscode.Position(prefixStartLine, 0),
    position
  );
  const prefix = document.getText(prefixRange);

  // ─── Suffix (code after cursor) ──────────────────────────────────────────
  const suffixEndLine = Math.min(document.lineCount - 1, position.line + maxSuffixLines);
  const suffixRange = new vscode.Range(
    position,
    new vscode.Position(suffixEndLine, document.lineAt(suffixEndLine).text.length)
  );
  const suffix = document.getText(suffixRange);

  // ─── Imports / top-of-file declarations ──────────────────────────────────
  const imports = extractImports(document);

  // ─── Related context from open editors ───────────────────────────────────
  const relatedContext = getRelatedEditorContext(document);

  return {
    prefix,
    suffix,
    languageId: document.languageId,
    filePath: document.fileName,
    lineNumber: position.line + 1,
    column: position.character + 1,
    imports,
    relatedContext,
  };
}

/**
 * Format the completion context into a prompt suitable for code completion.
 */
export function formatCompletionPrompt(ctx: CompletionContext): string {
  const parts: string[] = [];

  // Language hint
  parts.push(`Language: ${ctx.languageId}`);

  // Related context (if any)
  if (ctx.relatedContext) {
    parts.push(`\n// Related context from open files:\n${ctx.relatedContext}`);
  }

  // The actual FIM prompt
  parts.push(`\n// File: ${getBaseName(ctx.filePath)}`);

  if (ctx.imports && !ctx.prefix.includes(ctx.imports.trim())) {
    parts.push(`// Imports:\n${ctx.imports}`);
  }

  parts.push(`\n${ctx.prefix}`);

  return parts.join('\n');
}

/**
 * Build a system prompt for code completion.
 */
export function buildCompletionSystemPrompt(languageId: string): string {
  return `You are an expert code completion engine. Complete the code at the cursor position.

Rules:
- Output ONLY the completion text that should be inserted at the cursor position.
- Do NOT repeat any code that is already present before the cursor.
- Do NOT add explanations, comments about what you're doing, or markdown formatting.
- Do NOT wrap output in code blocks or backticks.
- Complete the current statement, block, or function naturally.
- Match the existing code style (indentation, naming conventions, patterns).
- Keep completions concise — complete the immediate context (1-5 lines typically).
- If the cursor is inside a function body, complete the function logic.
- If the cursor is at a function signature, complete the signature and body.
- If the cursor is mid-expression, complete the expression.
- Language: ${languageId}`;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractImports(document: vscode.TextDocument): string {
  const importLines: string[] = [];
  const maxScanLines = Math.min(40, document.lineCount);

  for (let i = 0; i < maxScanLines; i++) {
    const line = document.lineAt(i).text.trimStart();
    if (
      line.startsWith('import ') ||
      line.startsWith('from ') ||
      line.startsWith('require(') ||
      line.startsWith('const ') && line.includes('require(') ||
      line.startsWith('using ') ||
      line.startsWith('#include') ||
      line.startsWith('use ') ||
      line.startsWith('package ') ||
      line.startsWith('module ')
    ) {
      importLines.push(document.lineAt(i).text);
    }
  }

  return importLines.join('\n');
}

function getRelatedEditorContext(currentDocument: vscode.TextDocument): string {
  const parts: string[] = [];
  const visibleEditors = vscode.window.visibleTextEditors;

  for (const editor of visibleEditors) {
    if (editor.document.uri.toString() === currentDocument.uri.toString()) {
      continue;
    }

    // Only include code files, not output/terminal
    if (editor.document.uri.scheme !== 'file') {
      continue;
    }

    // Get visible range content (what's on screen, not the whole file)
    const visibleRange = editor.visibleRanges[0];
    if (!visibleRange) {continue;}

    const visibleText = editor.document.getText(visibleRange);
    if (visibleText.trim().length > 0) {
      const baseName = getBaseName(editor.document.fileName);
      // Limit to avoid prompt explosion
      const truncated = visibleText.length > 500
        ? visibleText.substring(0, 500) + '\n// ... (truncated)'
        : visibleText;
      parts.push(`// --- ${baseName} (${editor.document.languageId}) ---\n${truncated}`);
    }

    // Max 2 related files
    if (parts.length >= 2) {break;}
  }

  return parts.join('\n\n');
}

function getBaseName(filePath: string): string {
  const sep = filePath.includes('\\') ? '\\' : '/';
  const parts = filePath.split(sep);
  return parts[parts.length - 1] || filePath;
}
