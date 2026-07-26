import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ValidationResult } from './types';
import { showValidationReport } from './webview';

/**
 * Represents a single execution history item in the tree view.
 */
export class HistoryItem extends vscode.TreeItem {
  constructor(
    public readonly runDir: string,
    public readonly timestamp: Date,
    public readonly passed: boolean,
    public readonly durationMs: number,
    public readonly result: ValidationResult
  ) {
    const icon = passed ? '✅' : '❌';
    const dateStr = formatDate(timestamp);
    const label = `${icon} ${dateStr}`;
    super(label, vscode.TreeItemCollapsibleState.None);

    this.description = `${durationMs}ms`;
    this.tooltip = `${passed ? 'Passed' : 'Failed'} — ${dateStr} — ${durationMs}ms\n${runDir}`;
    this.iconPath = new vscode.ThemeIcon(
      passed ? 'pass' : 'error',
      new vscode.ThemeColor(passed ? 'testing.iconPassed' : 'testing.iconFailed')
    );

    this.command = {
      command: 'dbflow-validator.openHistoryItem',
      title: 'Open Validation Report',
      arguments: [this],
    };
  }
}

/**
 * Tree data provider that scans dbflow-validator-runs/ and displays history.
 */
export class HistoryProvider implements vscode.TreeDataProvider<HistoryItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<HistoryItem | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private items: HistoryItem[] = [];

  constructor(private readonly context: vscode.ExtensionContext) {
    this.loadHistory();
  }

  refresh(): void {
    this.loadHistory();
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: HistoryItem): vscode.TreeItem {
    return element;
  }

  getChildren(_element?: HistoryItem): HistoryItem[] {
    return this.items;
  }

  /**
   * Returns a summary string for display: "Últimas X: Y passed, Z failed"
   */
  getSummary(): string {
    const total = this.items.length;
    const passed = this.items.filter((i) => i.passed).length;
    const failed = total - passed;
    return `Últimas ${total}: ${passed} passed, ${failed} failed`;
  }

  private loadHistory(): void {
    this.items = [];

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceFolder) {
      return;
    }

    const runsDir = path.join(workspaceFolder, 'dbflow-validator-runs');
    if (!fs.existsSync(runsDir)) {
      return;
    }

    let entries: string[];
    try {
      entries = fs.readdirSync(runsDir);
    } catch {
      return;
    }

    const items: HistoryItem[] = [];

    for (const entry of entries) {
      const runDir = path.join(runsDir, entry);
      const reportPath = path.join(runDir, 'report.json');

      if (!fs.existsSync(reportPath)) {
        continue;
      }

      try {
        const stat = fs.statSync(runDir);
        if (!stat.isDirectory()) {
          continue;
        }

        const reportContent = fs.readFileSync(reportPath, 'utf-8');
        const result: ValidationResult = JSON.parse(reportContent);

        const timestamp = stat.mtime;
        const passed = result.status === 'PASSED';
        const durationMs = result.duration_ms ?? 0;

        items.push(new HistoryItem(runDir, timestamp, passed, durationMs, result));
      } catch {
        // Skip corrupted entries
        continue;
      }
    }

    // Sort descending by date (most recent first)
    items.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    this.items = items;
  }

  /**
   * Opens the webview for a specific history item.
   */
  openItem(item: HistoryItem): void {
    const scriptReportDir = path.join(item.runDir, 'script-report');
    const scriptReportPath = fs.existsSync(scriptReportDir) ? scriptReportDir : undefined;
    showValidationReport(this.context, item.result, scriptReportPath);
  }
}

function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}
