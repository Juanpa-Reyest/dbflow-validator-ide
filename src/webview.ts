import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ValidationResult } from './types';

let currentPanel: vscode.WebviewPanel | undefined;

/**
 * Shows the validation report in a WebView panel with a professional dashboard.
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

function formatDuration(ms: number): string {
  if (ms < 1000) { return `${ms}ms`; }
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) { return `${seconds}s`; }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

function buildHtml(
  result: ValidationResult,
  _webview: vscode.Webview,
  scriptReportPath?: string
): string {
  const passed = result.status === 'PASSED';
  const statusIcon = passed ? '✔' : '✘';
  const statusText = passed ? 'PASSED' : 'FAILED';
  const statusColorMain = passed ? '#00ff88' : '#ff4444';
  const statusGlow = passed ? 'rgba(0, 255, 136, 0.4)' : 'rgba(255, 68, 68, 0.4)';

  const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? 'N/A';
  const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
  const totalDuration = formatDuration(result.total_duration_ms);
  const runId = new Date().toISOString().replace(/[-:T]/g, '').substring(0, 15).replace(/(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/, '$1-$2-$3_$4-$5-$6');

  // Build steps rows
  const stepsRows = result.steps.map((step, index) => {
    const num = String(index + 1).padStart(2, '0');
    const stepPassed = step.status === 'passed';
    const stepSkipped = step.status === 'skipped';
    const icon = stepSkipped ? '⊘' : (stepPassed ? '✔' : '✘');
    const iconClass = stepSkipped ? 'step-skipped' : (stepPassed ? 'step-passed' : 'step-failed');
    const duration = step.duration_ms !== undefined ? formatDuration(step.duration_ms) : '—';
    const rowClass = index % 2 === 0 ? 'row-even' : 'row-odd';
    return `<tr class="${rowClass}">
      <td class="col-num">#${num}</td>
      <td class="col-icon ${iconClass}">${icon}</td>
      <td class="col-name">${step.name}</td>
      <td class="col-duration">${duration}</td>
    </tr>`;
  }).join('\n');

  // Build errors section
  const allErrors = result.steps.flatMap((step) =>
    (step.errors || []).map((e) => ({ ...e, stepName: step.name }))
  );

  let errorsSection = '';
  if (allErrors.length > 0) {
    const errorRows = allErrors.map((e, idx) => {
      const rowClass = idx % 2 === 0 ? 'row-even' : 'row-odd';
      return `<tr class="${rowClass}">
        <td class="err-file">${e.file || '—'}</td>
        <td class="err-line">${e.line ?? '—'}</td>
        <td class="err-rule">${e.rule || '—'}</td>
        <td class="err-msg">${e.message}</td>
        <td class="err-sev"><span class="sev-badge sev-${e.severity}">${e.severity.toUpperCase()}</span></td>
      </tr>`;
    }).join('\n');

    errorsSection = `
      <div class="section">
        <details open>
          <summary class="section-header">
            <span class="section-icon">⚠</span>
            <span class="section-title">ERRORS & WARNINGS</span>
            <span class="section-count">${allErrors.length}</span>
          </summary>
          <div class="section-body">
            <table class="errors-table">
              <thead>
                <tr>
                  <th>FILE</th>
                  <th>LINE</th>
                  <th>RULE</th>
                  <th>MESSAGE</th>
                  <th>SEVERITY</th>
                </tr>
              </thead>
              <tbody>
                ${errorRows}
              </tbody>
            </table>
          </div>
        </details>
      </div>`;
  }

  // Script report section
  let scriptReportSection = '';
  if (scriptReportPath) {
    const indexHtml = path.join(scriptReportPath, 'index.html');
    if (fs.existsSync(indexHtml)) {
      const reportContent = fs.readFileSync(indexHtml, 'utf-8');
      scriptReportSection = `
        <div class="section">
          <details>
            <summary class="section-header">
              <span class="section-icon">◈</span>
              <span class="section-title">SCRIPT REPORT</span>
            </summary>
            <div class="section-body script-report-container">
              ${reportContent}
            </div>
          </details>
        </div>`;
    }
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>DBFlow Validation Report</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;600;700&display=swap');

    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Consolas', monospace;
      font-size: 13px;
      background: #1a1a2e;
      color: #e0e0e0;
      padding: 0;
      line-height: 1.6;
      min-height: 100vh;
    }

    /* ═══ HEADER ═══ */
    .header {
      background: linear-gradient(135deg, #0f0f23 0%, #1a1a2e 50%, #16213e 100%);
      border-bottom: 1px solid rgba(0, 212, 255, 0.2);
      padding: 32px 40px;
      position: relative;
      overflow: hidden;
    }

    .header::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 2px;
      background: linear-gradient(90deg, transparent, ${statusColorMain}, transparent);
    }

    .header-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 20px;
    }

    .brand {
      display: flex;
      align-items: baseline;
      gap: 12px;
    }

    .brand-name {
      font-size: 20px;
      font-weight: 700;
      letter-spacing: 3px;
      color: #ffffff;
      text-transform: uppercase;
    }

    .brand-version {
      font-size: 11px;
      color: #00d4ff;
      background: rgba(0, 212, 255, 0.1);
      padding: 2px 8px;
      border-radius: 3px;
      border: 1px solid rgba(0, 212, 255, 0.3);
    }

    .status-badge {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 24px;
      border-radius: 6px;
      background: rgba(${passed ? '0, 255, 136' : '255, 68, 68'}, 0.08);
      border: 1px solid ${statusColorMain};
      box-shadow: 0 0 20px ${statusGlow}, inset 0 0 20px rgba(${passed ? '0, 255, 136' : '255, 68, 68'}, 0.05);
      animation: statusPulse 3s ease-in-out infinite;
    }

    @keyframes statusPulse {
      0%, 100% { box-shadow: 0 0 20px ${statusGlow}, inset 0 0 20px rgba(${passed ? '0, 255, 136' : '255, 68, 68'}, 0.05); }
      50% { box-shadow: 0 0 30px ${statusGlow}, inset 0 0 30px rgba(${passed ? '0, 255, 136' : '255, 68, 68'}, 0.1); }
    }

    .status-icon {
      font-size: 22px;
      color: ${statusColorMain};
    }

    .status-text {
      font-size: 18px;
      font-weight: 700;
      color: ${statusColorMain};
      letter-spacing: 2px;
    }

    .header-separator {
      color: rgba(0, 212, 255, 0.3);
      font-size: 11px;
      letter-spacing: -1px;
      user-select: none;
      overflow: hidden;
      white-space: nowrap;
    }

    /* ═══ RUN INFO BAR ═══ */
    .run-info {
      background: rgba(22, 33, 62, 0.6);
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
      padding: 10px 40px;
      display: flex;
      align-items: center;
      gap: 24px;
      font-size: 12px;
      color: #8892b0;
    }

    .run-info-item {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .run-info-label {
      color: #5a6380;
      text-transform: uppercase;
      font-size: 10px;
      letter-spacing: 1px;
    }

    .run-info-value {
      color: #00d4ff;
    }

    .run-info-separator {
      color: rgba(255, 255, 255, 0.15);
    }

    /* ═══ MAIN CONTENT ═══ */
    .content {
      padding: 24px 40px;
      max-width: 1000px;
    }

    /* ═══ STEPS TABLE ═══ */
    .section {
      margin-bottom: 24px;
    }

    .section-header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px 0;
      cursor: pointer;
      list-style: none;
      border-bottom: 1px solid rgba(255, 255, 255, 0.06);
      margin-bottom: 12px;
    }

    .section-header::-webkit-details-marker { display: none; }

    .section-icon {
      color: #00d4ff;
      font-size: 14px;
    }

    .section-title {
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 2px;
      color: #8892b0;
      text-transform: uppercase;
    }

    .section-count {
      font-size: 10px;
      background: rgba(0, 212, 255, 0.15);
      color: #00d4ff;
      padding: 1px 7px;
      border-radius: 10px;
      margin-left: 8px;
    }

    .steps-table {
      width: 100%;
      border-collapse: collapse;
    }

    .steps-table tr {
      transition: background 0.15s ease;
    }

    .steps-table tr:hover {
      background: rgba(0, 212, 255, 0.04) !important;
    }

    .row-even { background: transparent; }
    .row-odd { background: rgba(255, 255, 255, 0.015); }

    .steps-table td {
      padding: 8px 12px;
      border: none;
      vertical-align: middle;
    }

    .col-num {
      width: 50px;
      color: #5a6380;
      font-size: 11px;
    }

    .col-icon {
      width: 30px;
      font-size: 14px;
      text-align: center;
    }

    .step-passed { color: #00ff88; }
    .step-failed { color: #ff4444; }
    .step-skipped { color: #666; }

    .col-name {
      color: #ccd6f6;
      font-weight: 400;
    }

    .col-duration {
      text-align: right;
      color: #5a6380;
      font-size: 12px;
      width: 80px;
    }

    /* ═══ RESULT BANNER ═══ */
    .result-banner {
      margin: 24px 0;
      padding: 16px 24px;
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: linear-gradient(90deg, rgba(${passed ? '0, 255, 136' : '255, 68, 68'}, 0.1), rgba(${passed ? '0, 255, 136' : '255, 68, 68'}, 0.03));
      border: 1px solid rgba(${passed ? '0, 255, 136' : '255, 68, 68'}, 0.3);
    }

    .result-left {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .result-label {
      font-size: 10px;
      letter-spacing: 2px;
      color: #8892b0;
      text-transform: uppercase;
    }

    .result-status {
      font-size: 16px;
      font-weight: 700;
      color: ${statusColorMain};
      letter-spacing: 1px;
    }

    .result-duration {
      color: #5a6380;
      font-size: 12px;
    }

    /* ═══ ERRORS TABLE ═══ */
    .errors-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
    }

    .errors-table th {
      padding: 8px 12px;
      text-align: left;
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 1px;
      color: #5a6380;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    }

    .errors-table td {
      padding: 8px 12px;
      border: none;
      vertical-align: top;
    }

    .errors-table tr { transition: background 0.15s ease; }
    .errors-table tr:hover { background: rgba(255, 68, 68, 0.04) !important; }

    .err-file { color: #00d4ff; font-size: 11px; }
    .err-line { color: #5a6380; font-size: 11px; width: 50px; }
    .err-rule { color: #ffaa00; font-size: 11px; }
    .err-msg { color: #ccd6f6; }

    .sev-badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 3px;
      font-size: 9px;
      font-weight: 700;
      letter-spacing: 1px;
    }

    .sev-blocker { background: rgba(255, 68, 68, 0.2); color: #ff4444; border: 1px solid rgba(255, 68, 68, 0.3); }
    .sev-error { background: rgba(255, 68, 68, 0.15); color: #ff6666; border: 1px solid rgba(255, 68, 68, 0.2); }
    .sev-major { background: rgba(255, 170, 0, 0.15); color: #ffaa00; border: 1px solid rgba(255, 170, 0, 0.2); }
    .sev-warning { background: rgba(255, 170, 0, 0.12); color: #ffcc00; border: 1px solid rgba(255, 170, 0, 0.2); }
    .sev-minor { background: rgba(255, 235, 59, 0.12); color: #ffeb3b; border: 1px solid rgba(255, 235, 59, 0.2); }
    .sev-info { background: rgba(0, 212, 255, 0.1); color: #00d4ff; border: 1px solid rgba(0, 212, 255, 0.2); }

    /* ═══ SCRIPT REPORT ═══ */
    .script-report-container {
      margin-top: 12px;
      padding: 16px;
      background: rgba(0, 0, 0, 0.3);
      border: 1px solid rgba(255, 255, 255, 0.06);
      border-radius: 4px;
      overflow: auto;
      max-height: 500px;
    }

    /* ═══ FOOTER ═══ */
    .footer {
      margin-top: 32px;
      padding: 16px 40px;
      border-top: 1px solid rgba(255, 255, 255, 0.06);
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 11px;
      color: #3d4663;
    }

    .footer-item {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    /* ═══ DETAILS STYLING ═══ */
    details summary { list-style: none; }
    details summary::-webkit-details-marker { display: none; }
    details[open] .section-header .section-icon { color: #00ff88; }

    /* ═══ SCROLLBAR ═══ */
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: rgba(0, 0, 0, 0.2); }
    ::-webkit-scrollbar-thumb { background: rgba(0, 212, 255, 0.2); border-radius: 3px; }
    ::-webkit-scrollbar-thumb:hover { background: rgba(0, 212, 255, 0.4); }
  </style>
</head>
<body>
  <!-- ═══ HEADER ═══ -->
  <div class="header">
    <div class="header-top">
      <div class="brand">
        <span class="brand-name">DBFLOW VALIDATOR</span>
        <span class="brand-version">v0.1.0</span>
      </div>
      <div class="status-badge">
        <span class="status-icon">${statusIcon}</span>
        <span class="status-text">${statusText}</span>
      </div>
    </div>
    <div class="header-separator">──────────────────────────────────────────────────────────────────────────────────────────────</div>
  </div>

  <!-- ═══ RUN INFO BAR ═══ -->
  <div class="run-info">
    <div class="run-info-item">
      <span class="run-info-label">RUN</span>
      <span class="run-info-value">${runId}</span>
    </div>
    <span class="run-info-separator">·</span>
    <div class="run-info-item">
      <span class="run-info-label">duration</span>
      <span class="run-info-value">${totalDuration}</span>
    </div>
    <span class="run-info-separator">·</span>
    <div class="run-info-item">
      <span class="run-info-label">steps</span>
      <span class="run-info-value">${result.steps.length}</span>
    </div>
  </div>

  <!-- ═══ MAIN CONTENT ═══ -->
  <div class="content">

    <!-- Steps -->
    <div class="section">
      <details open>
        <summary class="section-header">
          <span class="section-icon">◆</span>
          <span class="section-title">VALIDATION STEPS</span>
          <span class="section-count">${result.steps.length}</span>
        </summary>
        <div class="section-body">
          <table class="steps-table">
            <tbody>
              ${stepsRows}
            </tbody>
          </table>
        </div>
      </details>
    </div>

    <!-- Result Banner -->
    <div class="result-banner">
      <div class="result-left">
        <span class="result-label">RESULT</span>
        <span class="result-status">${statusIcon}  ${statusText}</span>
      </div>
      <span class="result-duration">total ${totalDuration}</span>
    </div>

    <!-- Errors -->
    ${errorsSection}

    <!-- Script Report -->
    ${scriptReportSection}
  </div>

  <!-- ═══ FOOTER ═══ -->
  <div class="footer">
    <div class="footer-item">
      <span>⏱</span>
      <span>${timestamp}</span>
    </div>
    <div class="footer-item">
      <span>◇</span>
      <span>${workspacePath}</span>
    </div>
  </div>
</body>
</html>`;
}
