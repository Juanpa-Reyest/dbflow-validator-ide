import * as vscode from 'vscode';
import { ValidationResult, ValidationError } from './types';

/**
 * Maps ValidationResult errors to VS Code Diagnostics.
 * Groups errors by file and creates squiggly underlines in the editor.
 */
export function applyDiagnostics(
  diagnosticCollection: vscode.DiagnosticCollection,
  result: ValidationResult,
  workspaceFolder: string
): void {
  // Clear previous diagnostics
  diagnosticCollection.clear();

  // Collect all errors from all steps
  const errorsByFile = new Map<string, vscode.Diagnostic[]>();

  for (const step of result.steps) {
    if (!step.errors) {
      continue;
    }
    for (const error of step.errors) {
      const diagnostic = createDiagnostic(error, step.name);
      const filePath = error.file || '__unknown__';
      const existing = errorsByFile.get(filePath) || [];
      existing.push(diagnostic);
      errorsByFile.set(filePath, existing);
    }
  }

  // Apply diagnostics to the collection
  for (const [filePath, diagnostics] of errorsByFile) {
    let uri: vscode.Uri;
    if (filePath === '__unknown__') {
      // If no file specified, attach to workspace root
      uri = vscode.Uri.file(workspaceFolder);
    } else {
      // Resolve relative paths against workspace
      uri = vscode.Uri.file(
        filePath.startsWith('/') ? filePath : `${workspaceFolder}/${filePath}`
      );
    }
    diagnosticCollection.set(uri, diagnostics);
  }
}

/**
 * Creates a single VS Code Diagnostic from a ValidationError.
 */
function createDiagnostic(error: ValidationError, stepName: string): vscode.Diagnostic {
  // Line and column are 1-based from CLI, VS Code uses 0-based
  const line = error.line ? error.line - 1 : 0;
  const column = error.column ? error.column - 1 : 0;

  const range = new vscode.Range(line, column, line, column + 1);

  const severity = error.severity === 'error'
    ? vscode.DiagnosticSeverity.Error
    : vscode.DiagnosticSeverity.Warning;

  const message = error.rule
    ? `[${error.rule}] ${error.message}`
    : error.message;

  const diagnostic = new vscode.Diagnostic(range, message, severity);
  diagnostic.source = `dbflow-validator (${stepName})`;

  return diagnostic;
}

/**
 * Clears all diagnostics from the collection.
 */
export function clearDiagnostics(diagnosticCollection: vscode.DiagnosticCollection): void {
  diagnosticCollection.clear();
}
