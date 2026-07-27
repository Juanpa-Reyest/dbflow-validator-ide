import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ValidationResult } from './types';
import { showValidationReport } from './webview';

/**
 * Formats a duration in milliseconds to a human-readable string.
 */
function formatDuration(ms: number): string {
  if (ms < 1000) { return `${ms}ms`; }
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) { return `${seconds}s`; }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

/**
 * Reads the report.json from a run directory and extracts base_branch.
 */
function readBranch(runDir: string): string | undefined {
  try {
    const reportPath = path.join(runDir, 'report.json');
    if (fs.existsSync(reportPath)) {
      const content = fs.readFileSync(reportPath, 'utf-8');
      const data = JSON.parse(content);
      return data.base_branch || undefined;
    }
  } catch {
    // ignore
  }
  return undefined;
}

/**
 * Represents a single execution history item in the tree view.
 */
export class HistoryItem extends vscode.TreeItem {
  constructor(
    public readonly runDir: string,
    public readonly timestamp: Date,
    public readonly passed: boolean,
    public readonly durationMs: number,
    public readonly result: ValidationResult,
    public readonly runNumber: number,
    public readonly branch?: string
  ) {
    const label = `Run #${runNumber}`;
    super(label, vscode.TreeItemCollapsibleState.None);

    const statusIcon = passed ? '✔' : '✘';
    const durationStr = formatDuration(durationMs);
    const branchStr = branch ? ` · ${branch}` : '';

    this.description = `${statusIcon} ${durationStr}${branchStr}`;

    const dateStr = formatDate(timestamp);
    this.tooltip = new vscode.MarkdownString(
      `**Run #${runNumber}**\n\n` +
      `Status: ${passed ? '✔ PASSED' : '✘ FAILED'}\n\n` +
      `Duration: ${durationStr}\n\n` +
      `Branch: ${branch || '—'}\n\n` +
      `Date: ${dateStr}\n\n` +
      `Path: \`${runDir}\``
    );

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
  private treeView: vscode.TreeView<HistoryItem> | undefined;

  constructor(private readonly context: vscode.ExtensionContext) {
    this.loadHistory();
  }

  /**
   * Binds the TreeView instance so we can update its title/description.
   */
  setTreeView(treeView: vscode.TreeView<HistoryItem>): void {
    this.treeView = treeView;
    this.updateTreeViewDescription();
  }

  refresh(): void {
    this.loadHistory();
    this._onDidChangeTreeData.fire();
    this.updateTreeViewDescription();
  }

  getTreeItem(element: HistoryItem): vscode.TreeItem {
    return element;
  }

  getChildren(_element?: HistoryItem): HistoryItem[] {
    return this.items;
  }

  /**
   * Returns a summary string: "4 runs · 3 passed · 1 failed"
   */
  getSummary(): string {
    const total = this.items.length;
    if (total === 0) { return 'No runs yet'; }
    const passed = this.items.filter((i) => i.passed).length;
    const failed = total - passed;
    return `${total} runs · ${passed} passed · ${failed} failed`;
  }

  private updateTreeViewDescription(): void {
    if (this.treeView) {
      this.treeView.description = this.getSummary();
    }
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

    const items: Array<{ runDir: string; timestamp: Date; passed: boolean; durationMs: number; result: ValidationResult; branch?: string }> = [];

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
        const durationMs = result.total_duration_ms ?? 0;
        const branch = readBranch(runDir);

        items.push({ runDir, timestamp, passed, durationMs, result, branch });
      } catch {
        // Skip corrupted entries
        continue;
      }
    }

    // Sort ascending by date to assign sequential numbers (oldest = #1)
    items.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    // Assign sequential run numbers
    const historyItems = items.map((item, index) => new HistoryItem(
      item.runDir,
      item.timestamp,
      item.passed,
      item.durationMs,
      item.result,
      index + 1,
      item.branch
    ));

    // Reverse to show most recent first
    historyItems.reverse();

    this.items = historyItems;
  }

  /**
   * Opens the webview for a specific history item.
   */
  openItem(item: HistoryItem): void {
    const scriptReportDir = path.join(item.runDir, 'script-report');
    const scriptReportPath = fs.existsSync(scriptReportDir) ? scriptReportDir : undefined;
    showValidationReport(this.context, item.result, scriptReportPath, item.runDir);
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
