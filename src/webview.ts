import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ValidationResult } from './types';

let currentPanel: vscode.WebviewPanel | undefined;

/**
 * Shows the validation report in a WebView panel with a visual dashboard.
 * Creates a new panel or reveals the existing one.
 */
export function showValidationReport(
  context: vscode.ExtensionContext,
  result: ValidationResult,
  scriptReportPath?: string
): void {
  const column = vscode.ViewColumn.Beside;

  if (currentPanel) {
    currentPanel.reveal(column);
  } else {
    currentPanel = vscode.window.createWebviewPanel(
      'dbflowValidatorReport',
      'DBFlow Validation Report',
      column,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: scriptReportPath
          ? [vscode.Uri.file(scriptReportPath)]
          : [],
      }
    );

    currentPanel.onDidDispose(
      () => { currentPanel = undefined; },
      null,
      context.subscriptions
    );
  }

  currentPanel.webview.html = buildHtml(result, currentPanel.webview, scriptReportPath);
}

function buildHtml(
  result: ValidationResult,
  webview: vscode.Webview,
  scriptReportPath?: string
): string {
  const passed = result.status === 'PASSED';
  const statusIcon = passed ? '✅' : '❌';
  const statusText = passed ? 'PASSED' : 'FAILED';
  const statusColor = passed ? 'var(--vscode-testing-iconPassed, #4caf50)' : 'var(--vscode-testing-iconFailed, #f44336)';

  const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? 'N/A';
  const timestamp = new Date().toLocaleString();
  const totalDuration = result.total_duration_ms;

  // Build steps table rows
  const stepsRows = result.steps.map((step) => {
    const badge = stepBadge(step.status);
    const duration = step.message || '';
    return `<tr>
      <td>${step.name}</td>
      <td>${badge}</td>
      <td>${duration}</td>
    </tr>`;
  }).join('\n');

  // Build errors table
  const allErrors = result.steps.flatMap((step) =>
    (step.errors || []).map((e) => ({ ...e, stepName: step.name }))
  );

  let errorsSection = '';
  if (allErrors.length > 0) {
    const errorRows = allErrors.map((e) => {
      const sevBadge = severityBadge(e.severity);
      return `<tr>
        <td>${e.file || 'N/A'}</td>
        <td>${e.line ?? '-'}</td>
        <td>${e.rule || '-'}</td>
        <td>${e.message}</td>
        <td>${sevBadge}</td>
      </tr>`;
    }).join('\n');

    errorsSection = `
      <details open>
        <summary class="section-title">🔍 Errors &amp; Warnings (${allErrors.length})</summary>
        <table class="errors-table">
          <thead>
            <tr>
              <th>File</th>
              <th>Line</th>
              <th>Rule</th>
              <th>Message</th>
              <th>Severity</th>
            </tr>
          </thead>
          <tbody>
            ${errorRows}
          </tbody>
        </table>
      </details>`;
  }

  // Script report section
  let scriptReportSection = '';
  if (scriptReportPath) {
    const indexHtml = path.join(scriptReportPath, 'index.html');
    if (fs.existsSync(indexHtml)) {
      const reportContent = fs.readFileSync(indexHtml, 'utf-8');
      scriptReportSection = `
        <details>
          <summary class="section-title">📊 Script Validator Report</summary>
          <div class="script-report-container">
            ${reportContent}
          </div>
        </details>`;
    }
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>DBFlow Validation Report</title>
  <style>
    :root {
      --bg: var(--vscode-editor-background, #1e1e1e);
      --fg: var(--vscode-editor-foreground, #cccccc);
      --border: var(--vscode-panel-border, #444444);
      --card-bg: var(--vscode-editorWidget-background, #252526);
      --header-bg: var(--vscode-sideBar-background, #1e1e1e);
      --link: var(--vscode-textLink-foreground, #3794ff);
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif);
      font-size: var(--vscode-font-size, 13px);
      background: var(--bg);
      color: var(--fg);
      padding: 20px;
      line-height: 1.5;
    }

    .header {
      text-align: center;
      padding: 24px;
      margin-bottom: 20px;
      border-radius: 8px;
      background: var(--card-bg);
      border: 1px solid var(--border);
    }

    .status-icon {
      font-size: 48px;
      display: block;
      margin-bottom: 8px;
    }

    .status-text {
      font-size: 28px;
      font-weight: 700;
      color: ${statusColor};
      letter-spacing: 2px;
    }

    .quality-score {
      font-size: 16px;
      margin-top: 8px;
      opacity: 0.8;
    }

    .card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 16px;
      margin-bottom: 16px;
    }

    .section-title {
      font-size: 15px;
      font-weight: 600;
      margin-bottom: 12px;
      cursor: pointer;
      padding: 8px 0;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
    }

    th, td {
      padding: 8px 12px;
      text-align: left;
      border-bottom: 1px solid var(--border);
    }

    th {
      font-weight: 600;
      opacity: 0.8;
      text-transform: uppercase;
      font-size: 11px;
      letter-spacing: 0.5px;
    }

    tr:last-child td {
      border-bottom: none;
    }

    .badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
    }

    .badge-passed { background: rgba(76, 175, 80, 0.2); color: #4caf50; }
    .badge-failed { background: rgba(244, 67, 54, 0.2); color: #f44336; }
    .badge-skipped { background: rgba(158, 158, 158, 0.2); color: #9e9e9e; }

    .badge-blocker { background: rgba(244, 67, 54, 0.2); color: #f44336; }
    .badge-major { background: rgba(255, 152, 0, 0.2); color: #ff9800; }
    .badge-minor { background: rgba(255, 235, 59, 0.2); color: #fdd835; }
    .badge-info { background: rgba(33, 150, 243, 0.2); color: #2196f3; }
    .badge-error { background: rgba(244, 67, 54, 0.2); color: #f44336; }
    .badge-warning { background: rgba(255, 152, 0, 0.2); color: #ff9800; }

    .errors-table td:first-child {
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 11px;
    }

    .footer {
      text-align: center;
      padding: 16px;
      opacity: 0.6;
      font-size: 11px;
      border-top: 1px solid var(--border);
      margin-top: 20px;
    }

    .script-report-container {
      margin-top: 12px;
      padding: 12px;
      border: 1px solid var(--border);
      border-radius: 4px;
      overflow: auto;
      max-height: 600px;
    }

    details {
      margin-bottom: 16px;
    }

    details summary {
      list-style: none;
    }

    details summary::before {
      content: '▶ ';
      font-size: 10px;
    }

    details[open] summary::before {
      content: '▼ ';
    }
  </style>
</head>
<body>
  <div class="header">
    <span class="status-icon">${statusIcon}</span>
    <span class="status-text">${statusText}</span>
    <div class="quality-score">Duration: ${totalDuration}ms</div>
  </div>

  <div class="card">
    <details open>
      <summary class="section-title">📋 Validation Steps (${result.steps.length})</summary>
      <table>
        <thead>
          <tr>
            <th>Step</th>
            <th>Status</th>
            <th>Details</th>
          </tr>
        </thead>
        <tbody>
          ${stepsRows}
        </tbody>
      </table>
    </details>
  </div>

  ${errorsSection ? `<div class="card">${errorsSection}</div>` : ''}

  ${scriptReportSection ? `<div class="card">${scriptReportSection}</div>` : ''}

  <div class="footer">
    <p>⏱ Total Duration: ${totalDuration}ms | 🕐 ${timestamp}</p>
    <p>📁 Workspace: ${workspacePath}</p>
  </div>
</body>
</html>`;
}

function stepBadge(status: string): string {
  switch (status) {
    case 'passed':
      return '<span class="badge badge-passed">✓ Passed</span>';
    case 'failed':
      return '<span class="badge badge-failed">✗ Failed</span>';
    case 'skipped':
      return '<span class="badge badge-skipped">⊘ Skipped</span>';
    default:
      return `<span class="badge">${status}</span>`;
  }
}

function severityBadge(severity: string): string {
  const normalized = severity.toLowerCase();
  switch (normalized) {
    case 'blocker':
      return '<span class="badge badge-blocker">BLOCKER</span>';
    case 'major':
      return '<span class="badge badge-major">MAJOR</span>';
    case 'minor':
      return '<span class="badge badge-minor">MINOR</span>';
    case 'info':
      return '<span class="badge badge-info">INFO</span>';
    case 'error':
      return '<span class="badge badge-error">ERROR</span>';
    case 'warning':
      return '<span class="badge badge-warning">WARNING</span>';
    default:
      return `<span class="badge">${severity}</span>`;
  }
}
