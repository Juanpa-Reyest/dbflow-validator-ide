import * as vscode from 'vscode';
import { resolveBinary, downloadBinary } from './binary';
import { runValidator } from './runner';
import { applyDiagnostics, clearDiagnostics } from './diagnostics';

let statusBarItem: vscode.StatusBarItem;
let outputChannel: vscode.OutputChannel;
let diagnosticCollection: vscode.DiagnosticCollection;

export function activate(context: vscode.ExtensionContext): void {
  // Create output channel for detailed logs
  outputChannel = vscode.window.createOutputChannel('DBFlow Validator');
  context.subscriptions.push(outputChannel);

  // Create diagnostic collection for squiggles
  diagnosticCollection = vscode.languages.createDiagnosticCollection('dbflow-validator');
  context.subscriptions.push(diagnosticCollection);

  // Create status bar item
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusBarItem.text = '$(database) DBFlow: Validate';
  statusBarItem.tooltip = 'Run DBFlow Validator on current workspace';
  statusBarItem.command = 'dbflow-validator.validate';
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  // Register validate command
  const validateCommand = vscode.commands.registerCommand('dbflow-validator.validate', async () => {
    await executeValidation(context);
  });
  context.subscriptions.push(validateCommand);

  outputChannel.appendLine('DBFlow Validator extension activated.');
}

async function executeValidation(context: vscode.ExtensionContext): Promise<void> {
  // Get workspace folder
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    vscode.window.showErrorMessage('DBFlow Validator: No workspace folder open.');
    return;
  }
  const workspaceFolder = workspaceFolders[0].uri.fsPath;

  // Update status bar
  statusBarItem.text = '$(sync~spin) DBFlow: Validating...';

  outputChannel.appendLine(`\n--- Validation started at ${new Date().toISOString()} ---`);
  outputChannel.appendLine(`Workspace: ${workspaceFolder}`);

  try {
    // 1. Resolve binary
    let binaryPath = await resolveBinary(context);

    if (!binaryPath) {
      const choice = await vscode.window.showInformationMessage(
        'dbflow-validator binary not found. Download it from GitHub Releases?',
        'Download',
        'Cancel'
      );

      if (choice !== 'Download') {
        statusBarItem.text = '$(database) DBFlow: Validate';
        return;
      }

      binaryPath = await downloadBinary(context);
      outputChannel.appendLine(`Binary downloaded to: ${binaryPath}`);
    }

    outputChannel.appendLine(`Using binary: ${binaryPath}`);

    // 2. Run validation
    const runResult = await runValidator(binaryPath, workspaceFolder);

    // 3. Handle result
    switch (runResult.kind) {
      case 'passed':
        clearDiagnostics(diagnosticCollection);
        statusBarItem.text = '$(check) DBFlow: Passed';
        vscode.window.showInformationMessage(
          `DBFlow Validator: All checks passed! (${runResult.result?.duration_ms}ms)`
        );
        outputChannel.appendLine(`Result: PASSED - ${runResult.result?.summary}`);
        break;

      case 'failed':
        if (runResult.result) {
          applyDiagnostics(diagnosticCollection, runResult.result, workspaceFolder);
          const errorCount = runResult.result.steps
            .flatMap(s => s.errors || [])
            .filter(e => e.severity === 'error').length;
          const warnCount = runResult.result.steps
            .flatMap(s => s.errors || [])
            .filter(e => e.severity === 'warning').length;

          statusBarItem.text = `$(error) DBFlow: ${errorCount} errors, ${warnCount} warnings`;
          vscode.window.showWarningMessage(
            `DBFlow Validator: ${runResult.result.summary}`
          );
          outputChannel.appendLine(`Result: FAILED - ${runResult.result.summary}`);
        }
        break;

      case 'cancelled':
        statusBarItem.text = '$(database) DBFlow: Validate';
        outputChannel.appendLine('Result: Cancelled by user.');
        break;

      case 'error':
        statusBarItem.text = '$(warning) DBFlow: Error';
        vscode.window.showErrorMessage(
          `DBFlow Validator error: ${runResult.errorMessage}`
        );
        outputChannel.appendLine(`Error: ${runResult.errorMessage}`);
        break;
    }
  } catch (err) {
    statusBarItem.text = '$(warning) DBFlow: Error';
    const message = err instanceof Error ? err.message : String(err);
    vscode.window.showErrorMessage(`DBFlow Validator: ${message}`);
    outputChannel.appendLine(`Unexpected error: ${message}`);
  }

  // Reset status bar after 10 seconds for non-idle states
  setTimeout(() => {
    if (statusBarItem.text !== '$(database) DBFlow: Validate') {
      statusBarItem.text = '$(database) DBFlow: Validate';
    }
  }, 10000);
}

export function deactivate(): void {
  clearDiagnostics(diagnosticCollection);
}
