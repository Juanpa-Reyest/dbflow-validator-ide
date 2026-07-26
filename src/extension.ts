import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { resolveBinary } from './binary';
import { runValidator } from './runner';
import { applyDiagnostics, clearDiagnostics } from './diagnostics';
import { showValidationReport } from './webview';
import { HistoryProvider, HistoryItem } from './history';

let statusBarItem: vscode.StatusBarItem;
let outputChannel: vscode.OutputChannel;
let diagnosticCollection: vscode.DiagnosticCollection;
let historyProvider: HistoryProvider;

export function activate(context: vscode.ExtensionContext): void {
  // Create output channel for detailed logs
  outputChannel = vscode.window.createOutputChannel('DBFlow Validator');
  context.subscriptions.push(outputChannel);

  // Create diagnostic collection for squiggles
  diagnosticCollection = vscode.languages.createDiagnosticCollection('dbflow-validator');
  context.subscriptions.push(diagnosticCollection);

  // Create status bar item — single button to run validation
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusBarItem.text = '$(database) DBFlow: Validate';
  statusBarItem.tooltip = 'Run DBFlow Validator on current workspace';
  statusBarItem.command = 'dbflow-validator.validate';
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  // Register history tree view provider
  historyProvider = new HistoryProvider(context);
  const treeView = vscode.window.createTreeView('dbflow-validator-history', {
    treeDataProvider: historyProvider,
    showCollapseAll: false,
  });
  context.subscriptions.push(treeView);

  // Update tree view description with summary
  treeView.description = historyProvider.getSummary();

  // Register validate command
  const validateCommand = vscode.commands.registerCommand('dbflow-validator.validate', async () => {
    await executeValidation(context);
    treeView.description = historyProvider.getSummary();
  });
  context.subscriptions.push(validateCommand);

  // Register command to open a history item
  const openHistoryCommand = vscode.commands.registerCommand(
    'dbflow-validator.openHistoryItem',
    (item: HistoryItem) => {
      historyProvider.openItem(item);
    }
  );
  context.subscriptions.push(openHistoryCommand);

  outputChannel.appendLine('DBFlow Validator extension activated.');
}

/**
 * Executes the full validation pipeline autonomously.
 * No user interaction required — binary is resolved/downloaded silently,
 * validation runs, and results are displayed automatically.
 */
async function executeValidation(context: vscode.ExtensionContext): Promise<void> {
  // Get workspace folder
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    vscode.window.showErrorMessage('DBFlow Validator: No workspace folder open.');
    return;
  }
  const workspaceFolder = workspaceFolders[0].uri.fsPath;

  // Update status bar to show we're working (with warning background for visibility)
  statusBarItem.text = '$(loading~spin) DBFlow: Running...';
  statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');

  outputChannel.appendLine(`\n--- Validation started at ${new Date().toISOString()} ---`);
  outputChannel.appendLine(`Workspace: ${workspaceFolder}`);

  // Wrap entire execution in a visible progress notification
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'DBFlow Validator',
      cancellable: false,
    },
    async (progress) => {
      try {
        // 1. Resolve binary — downloads silently if not found (zero interaction)
        progress.report({ message: 'Resolving binary...' });
        const binaryPath = await resolveBinary(context, outputChannel);
        outputChannel.appendLine(`Using binary: ${binaryPath}`);

        // 2. Run validation — fully automatic
        progress.report({ message: 'Running validation... this may take ~30s' });
        const runResult = await runValidator(binaryPath, workspaceFolder);

        // 3. Determine script-report path
        progress.report({ message: 'Processing results...' });
        let scriptReportPath: string | undefined;
        if (runResult.runDir) {
          const candidatePath = path.join(runResult.runDir, 'script-report');
          if (fs.existsSync(candidatePath)) {
            scriptReportPath = candidatePath;
          }
        }

        // 4. Display results — no questions, just show what happened
        switch (runResult.kind) {
          case 'passed':
            clearDiagnostics(diagnosticCollection);
            statusBarItem.text = '$(check) DBFlow: Passed';
            statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.prominentBackground');
            vscode.window.showInformationMessage(
              `✅ DBFlow Validator: All checks passed! (${runResult.result?.total_duration_ms}ms)`
            );
            outputChannel.appendLine(`Result: PASSED - ${runResult.result?.summary}`);

            // Open WebView with results
            if (runResult.result) {
              showValidationReport(context, runResult.result, scriptReportPath);
            }
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
              statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
              vscode.window.showWarningMessage(
                `❌ DBFlow Validator: ${runResult.result.summary}`
              );
              outputChannel.appendLine(`Result: FAILED - ${runResult.result.summary}`);

              // Open WebView with results
              showValidationReport(context, runResult.result, scriptReportPath);

              // Automatically show the output channel so the dev sees the details
              outputChannel.show(true);
            }
            break;

          case 'cancelled':
            statusBarItem.text = '$(database) DBFlow: Validate';
            statusBarItem.backgroundColor = undefined;
            outputChannel.appendLine('Result: Cancelled.');
            break;

          case 'error':
            statusBarItem.text = '$(warning) DBFlow: Error';
            statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
            vscode.window.showErrorMessage(
              `DBFlow Validator error: ${runResult.errorMessage}`
            );
            outputChannel.appendLine(`Error: ${runResult.errorMessage}`);
            outputChannel.show(true);
            break;
        }

        // 5. Refresh history after execution
        historyProvider.refresh();
      } catch (err) {
        statusBarItem.text = '$(warning) DBFlow: Error';
        statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
        const message = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`DBFlow Validator: ${message}`);
        outputChannel.appendLine(`Unexpected error: ${message}`);
        outputChannel.show(true);
      }

      // Reset status bar after 10 seconds
      setTimeout(() => {
        if (statusBarItem.text !== '$(database) DBFlow: Validate') {
          statusBarItem.text = '$(database) DBFlow: Validate';
          statusBarItem.backgroundColor = undefined;
        }
      }, 10000);
    }
  );
}

export function deactivate(): void {
  clearDiagnostics(diagnosticCollection);
}
