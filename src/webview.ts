import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ValidationResult } from './types';

let currentPanel: vscode.WebviewPanel | undefined;

// ═══════════════════════════════════════════════════════════════════════════════
// SVG ICONS
// ═══════════════════════════════════════════════════════════════════════════════

function svgDatabase(size = 24, color = '#00d4ff'): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <ellipse cx="12" cy="5" rx="9" ry="3"/>
    <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/>
    <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
  </svg>`;
}

function svgCalendar(size = 14, color = '#8892b0'): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
    <line x1="16" y1="2" x2="16" y2="6"/>
    <line x1="8" y1="2" x2="8" y2="6"/>
    <line x1="3" y1="10" x2="21" y2="10"/>
  </svg>`;
}

function svgClock(size = 14, color = '#8892b0'): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <polyline points="12 6 12 12 16 14"/>
  </svg>`;
}

function svgGitBranch(size = 14, color = '#8892b0'): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <line x1="6" y1="3" x2="6" y2="15"/>
    <circle cx="18" cy="6" r="3"/>
    <circle cx="6" cy="18" r="3"/>
    <path d="M18 9a9 9 0 0 1-9 9"/>
  </svg>`;
}

function svgLayers(size = 14, color = '#8892b0'): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <polygon points="12 2 2 7 12 12 22 7 12 2"/>
    <polyline points="2 17 12 22 22 17"/>
    <polyline points="2 12 12 17 22 12"/>
  </svg>`;
}

function svgCheckCircle(size = 22, color = '#00ff88'): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
    <polyline points="22 4 12 14.01 9 11.01"/>
  </svg>`;
}

function svgXCircle(size = 22, color = '#ff4455'): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <line x1="15" y1="9" x2="9" y2="15"/>
    <line x1="9" y1="9" x2="15" y2="15"/>
  </svg>`;
}

function svgAlertTriangle(size = 14, color = '#ffaa00'): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
    <line x1="12" y1="9" x2="12" y2="13"/>
    <line x1="12" y1="17" x2="12.01" y2="17"/>
  </svg>`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN EXPORT
// ═══════════════════════════════════════════════════════════════════════════════

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
    currentPanel.webview.html = buildHtml(result, scriptReportPath);
  } else {
    const localResourceRoots: vscode.Uri[] = [];
    if (scriptReportPath && fs.existsSync(scriptReportPath)) {
      localResourceRoots.push(vscode.Uri.file(scriptReportPath));
    }

    currentPanel = vscode.window.createWebviewPanel(
      'dbflowValidatorReport',
      'DBFlow Validation Report',
      column,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots,
      }
    );

    currentPanel.onDidDispose(
      () => { currentPanel = undefined; },
      null,
      context.subscriptions
    );

    currentPanel.webview.html = buildHtml(result, scriptReportPath);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

function formatDuration(ms: number): string {
  if (ms < 1000) { return `${ms}ms`; }
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) { return `${seconds}s`; }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Reads the script-report folder and builds a self-contained HTML string
 * by inlining CSS and JS into the HTML.
 */
function buildEmbeddedScriptReport(scriptReportPath: string): string | null {
  const htmlPath = path.join(scriptReportPath, 'validation_report.html');
  const cssPath = path.join(scriptReportPath, 'css', 'styles.css');
  const jsPath = path.join(scriptReportPath, 'js', 'app.js');

  if (!fs.existsSync(htmlPath)) { return null; }

  let html = fs.readFileSync(htmlPath, 'utf-8');

  // Force dark theme on the embedded report
  html = html.replace('data-theme="light"', 'data-theme="dark"');

  // Inline CSS: replace <link rel="stylesheet" href="css/styles.css" /> with <style>...</style>
  if (fs.existsSync(cssPath)) {
    const css = fs.readFileSync(cssPath, 'utf-8');
    html = html.replace(
      /<link[^>]*href=["']css\/styles\.css["'][^>]*\/?>/i,
      `<style>${css}</style>`
    );
  }

  // Inline JS: replace <script src="js/app.js"></script> with <script>...</script>
  if (fs.existsSync(jsPath)) {
    const js = fs.readFileSync(jsPath, 'utf-8');
    html = html.replace(
      /<script[^>]*src=["']js\/app\.js["'][^>]*><\/script>/i,
      `<script>${js}</script>`
    );
  }

  // Remove the theme toggle button (since we force dark)
  html = html.replace(/<button[^>]*id=["']themeToggle["'][^>]*>[\s\S]*?<\/button>/i, '');

  return html;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HTML BUILDER
// ═══════════════════════════════════════════════════════════════════════════════

function buildHtml(
  result: ValidationResult,
  scriptReportPath?: string
): string {
  const passed = result.status === 'PASSED';
  const statusColorMain = passed ? '#00ff88' : '#ff4455';
  const statusGlow = passed ? 'rgba(0, 255, 136, 0.4)' : 'rgba(255, 68, 85, 0.4)';
  const statusIcon = passed ? svgCheckCircle(22, statusColorMain) : svgXCircle(22, statusColorMain);
  const statusText = passed ? 'PASSED' : 'FAILED';

  const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? 'N/A';
  const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
  const totalDuration = formatDuration(result.total_duration_ms);
  const now = new Date();
  const runId = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}-${String(now.getSeconds()).padStart(2, '0')}`;

  // Detect branch from workspace folder name or git
  const branchName = path.basename(workspacePath);

  // Build steps rows (terminal style)
  const stepsHtml = result.steps.map((step, index) => {
    const num = String(index + 1).padStart(2, ' ');
    const stepPassed = step.status === 'passed';
    const stepSkipped = step.status === 'skipped';
    const icon = stepSkipped ? '⊘' : (stepPassed ? '✔' : '✘');
    const iconClass = stepSkipped ? 'icon-skipped' : (stepPassed ? 'icon-passed' : 'icon-failed');
    const duration = step.duration_ms !== undefined ? formatDuration(step.duration_ms) : '—';
    const nameLen = step.name.length;
    const dotsCount = Math.max(2, 36 - nameLen);
    const dots = '.'.repeat(dotsCount);

    let errorLine = '';
    if (step.status === 'failed' && step.errors && step.errors.length > 0) {
      const firstErr = step.errors[0];
      errorLine = `<div class="step-error-line">     └─ ERROR: ${escapeHtml(firstErr.message.split('\n')[0].substring(0, 120))}</div>`;
    } else if (step.status === 'failed' && step.message) {
      // Only show first meaningful line, not entire Maven trace
      const lines = step.message.split('\n').filter(l => l.trim().length > 0);
      const summary = lines[0]?.substring(0, 120) || 'Step failed';
      errorLine = `<div class="step-error-line">     └─ ${escapeHtml(summary)}</div>`;
    }

    return `<div class="step-row">
      <span class="step-content"><span class="${iconClass}">   ${icon}</span>  <span class="step-num">${num}</span>  <span class="step-name">${escapeHtml(step.name)}</span> <span class="step-dots">${dots}</span> <span class="step-duration">${duration}</span></span>${errorLine}
    </div>`;
  }).join('\n');

  // Embedded script report
  let scriptReportContent = '<div class="no-report">No script report available for this run</div>';
  if (scriptReportPath) {
    const embedded = buildEmbeddedScriptReport(scriptReportPath);
    if (embedded) {
      scriptReportContent = `<div class="script-report-frame">${embedded}</div>`;
    }
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>DBFlow Validation Report</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Consolas', monospace;
      font-size: 13px;
      background: #0f0f1a;
      color: #e0e0e0;
      padding: 0;
      line-height: 1.6;
      min-height: 100vh;
    }

    /* ═══════════════════════════════════════════════════════════════════════════
       HEADER
       ═══════════════════════════════════════════════════════════════════════════ */
    .header {
      background: linear-gradient(135deg, #0a0a14 0%, #1a1a2e 50%, #0f1528 100%);
      border-bottom: 1px solid rgba(0, 212, 255, 0.15);
      padding: 28px 32px 20px;
      position: relative;
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

    .header-content {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 14px;
    }

    .brand-logo {
      display: flex;
      align-items: center;
    }

    .brand-text {
      display: flex;
      align-items: baseline;
      gap: 10px;
    }

    .brand-name {
      font-size: 18px;
      font-weight: 700;
      letter-spacing: 3px;
      color: #ffffff;
    }

    .brand-version {
      font-size: 10px;
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
      background: rgba(${passed ? '0, 255, 136' : '255, 68, 85'}, 0.08);
      border: 1px solid ${statusColorMain};
      box-shadow: 0 0 20px ${statusGlow}, inset 0 0 15px rgba(${passed ? '0, 255, 136' : '255, 68, 85'}, 0.05);
      animation: statusPulse 3s ease-in-out infinite;
    }

    @keyframes statusPulse {
      0%, 100% { box-shadow: 0 0 20px ${statusGlow}; }
      50% { box-shadow: 0 0 35px ${statusGlow}; }
    }

    .status-badge-icon {
      display: flex;
      align-items: center;
    }

    .status-badge-text {
      font-size: 16px;
      font-weight: 700;
      color: ${statusColorMain};
      letter-spacing: 2px;
    }

    /* ═══════════════════════════════════════════════════════════════════════════
       INFO BAR
       ═══════════════════════════════════════════════════════════════════════════ */
    .info-bar {
      background: rgba(15, 15, 26, 0.8);
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
      padding: 10px 32px;
      display: flex;
      align-items: center;
      gap: 24px;
      font-size: 12px;
    }

    .info-item {
      display: flex;
      align-items: center;
      gap: 7px;
    }

    .info-item svg {
      flex-shrink: 0;
    }

    .info-value {
      color: #00d4ff;
    }

    .info-separator {
      color: rgba(255, 255, 255, 0.15);
      user-select: none;
    }

    /* ═══════════════════════════════════════════════════════════════════════════
       TABS
       ═══════════════════════════════════════════════════════════════════════════ */
    .tabs-bar {
      background: #1a1a2e;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      padding: 0 32px;
      display: flex;
      gap: 0;
    }

    .tab-btn {
      background: none;
      border: none;
      color: #666680;
      font-family: inherit;
      font-size: 12px;
      font-weight: 500;
      padding: 12px 20px;
      cursor: pointer;
      border-bottom: 2px solid transparent;
      transition: all 0.2s ease;
      letter-spacing: 0.5px;
    }

    .tab-btn:hover {
      color: #e0e0e0;
      background: rgba(0, 212, 255, 0.03);
    }

    .tab-btn.active {
      color: #00d4ff;
      border-bottom-color: #00d4ff;
    }

    .tab-content {
      display: none;
    }

    .tab-content.active {
      display: block;
    }

    /* ═══════════════════════════════════════════════════════════════════════════
       TAB 1: PIPELINE
       ═══════════════════════════════════════════════════════════════════════════ */
    .pipeline-content {
      padding: 24px 32px;
    }

    .steps-header-line {
      color: #666680;
      font-size: 11px;
      letter-spacing: -0.5px;
      user-select: none;
      margin-bottom: 8px;
      overflow: hidden;
    }

    .step-row {
      padding: 4px 0;
      transition: background 0.15s ease;
      border-radius: 3px;
    }

    .step-row:hover {
      background: rgba(0, 212, 255, 0.04);
    }

    .step-content {
      display: inline;
      white-space: pre;
    }

    .icon-passed { color: #00ff88; }
    .icon-failed { color: #ff4455; }
    .icon-skipped { color: #666680; }

    .step-num { color: #888; font-weight: 600; }
    .step-name { color: #ffffff; font-weight: 500; }
    .step-dots { color: #2a2a3e; }
    .step-duration { color: #00d4ff; font-weight: 500; }

    .step-error-line {
      color: #ff4455;
      font-size: 12px;
      padding: 2px 0 6px 0;
      white-space: pre-wrap;
      word-break: break-word;
    }

    .steps-footer-line {
      color: #666680;
      font-size: 11px;
      letter-spacing: -0.5px;
      user-select: none;
      margin-top: 8px;
    }

    /* ═══════════════════════════════════════════════════════════════════════════
       RESULT BANNER
       ═══════════════════════════════════════════════════════════════════════════ */
    .result-banner {
      margin: 24px 0 0;
      padding: 18px 24px;
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 16px;
      background: linear-gradient(90deg, rgba(${passed ? '0, 255, 136' : '255, 68, 85'}, 0.12), rgba(${passed ? '0, 255, 136' : '255, 68, 85'}, 0.04));
      border: 1px solid rgba(${passed ? '0, 255, 136' : '255, 68, 85'}, 0.3);
    }

    .result-text {
      font-size: 15px;
      font-weight: 700;
      color: ${statusColorMain};
      letter-spacing: 2px;
    }

    .result-duration {
      color: #666680;
      font-size: 13px;
      margin-left: 16px;
    }

    /* ═══════════════════════════════════════════════════════════════════════════
       FOOTER
       ═══════════════════════════════════════════════════════════════════════════ */
    .footer {
      margin-top: 32px;
      padding: 14px 32px;
      border-top: 1px solid rgba(255, 255, 255, 0.06);
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 11px;
      color: #3d4663;
    }

    /* ═══════════════════════════════════════════════════════════════════════════
       TAB 2: SCRIPT REPORT
       ═══════════════════════════════════════════════════════════════════════════ */
    .script-report-frame {
      all: initial;
      display: block;
      width: 100%;
      min-height: 400px;
      font-family: sans-serif;
      color-scheme: dark;
    }

    .script-report-frame * {
      all: revert;
    }

    /* Force dark theme on the embedded script-report */
    .script-report-frame [data-theme],
    .script-report-frame html {
      color-scheme: dark !important;
    }

    .no-report {
      padding: 60px 32px;
      text-align: center;
      color: #666680;
      font-size: 14px;
    }

    .no-report::before {
      content: '📊';
      display: block;
      font-size: 48px;
      margin-bottom: 16px;
      opacity: 0.4;
    }

    /* ═══════════════════════════════════════════════════════════════════════════
       SCROLLBAR
       ═══════════════════════════════════════════════════════════════════════════ */
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: rgba(0, 0, 0, 0.2); }
    ::-webkit-scrollbar-thumb { background: rgba(0, 212, 255, 0.2); border-radius: 3px; }
    ::-webkit-scrollbar-thumb:hover { background: rgba(0, 212, 255, 0.4); }
  </style>
</head>
<body>
  <!-- ═══ HEADER ═══ -->
  <div class="header">
    <div class="header-content">
      <div class="brand">
        <div class="brand-logo">${svgDatabase(28, '#00d4ff')}</div>
        <div class="brand-text">
          <span class="brand-name">DBFLOW VALIDATOR</span>
          <span class="brand-version">v0.3.2</span>
        </div>
      </div>
      <div class="status-badge">
        <span class="status-badge-icon">${statusIcon}</span>
        <span class="status-badge-text">${statusText}</span>
      </div>
    </div>
  </div>

  <!-- ═══ INFO BAR ═══ -->
  <div class="info-bar">
    <div class="info-item">${svgCalendar(14, '#666680')}<span class="info-value">RUN ${runId}</span></div>
    <span class="info-separator">·</span>
    <div class="info-item">${svgClock(14, '#666680')}<span class="info-value">${totalDuration}</span></div>
    <span class="info-separator">·</span>
    <div class="info-item">${svgGitBranch(14, '#666680')}<span class="info-value">${escapeHtml(branchName)}</span></div>
    <span class="info-separator">·</span>
    <div class="info-item">${svgLayers(14, '#666680')}<span class="info-value">${result.steps.length} steps</span></div>
  </div>

  <!-- ═══ TABS ═══ -->
  <div class="tabs-bar">
    <button class="tab-btn active" data-tab="pipeline">🛠️ Pipeline</button>
    <button class="tab-btn" data-tab="quality-report">📊 Quality Report</button>
  </div>

  <!-- ═══ TAB 1: PIPELINE ═══ -->
  <div class="tab-content active" id="tab-pipeline">
    <div class="pipeline-content">
      <div class="steps-header-line">────────────────────────────────────────────────────────────────</div>
      ${stepsHtml}
      <div class="steps-footer-line">────────────────────────────────────────────────────────────────</div>

      <div class="result-banner">
        <span class="result-text">RESULT  ${passed ? '✔' : '✘'}  ${statusText}</span>
        <span class="result-duration">total ${totalDuration}</span>
      </div>
    </div>

    <!-- FOOTER -->
    <div class="footer">
      <span>${timestamp}</span>
      <span>${escapeHtml(workspacePath)}</span>
    </div>
  </div>

  <!-- ═══ TAB 2: QUALITY REPORT ═══ -->
  <div class="tab-content" id="tab-quality-report">
    ${scriptReportContent}
  </div>

  <!-- ═══ TAB SWITCHING SCRIPT ═══ -->
  <script>
    (function() {
      const tabs = document.querySelectorAll('.tab-btn');
      const contents = document.querySelectorAll('.tab-content');

      tabs.forEach(function(tab) {
        tab.addEventListener('click', function() {
          const target = this.getAttribute('data-tab');

          tabs.forEach(function(t) { t.classList.remove('active'); });
          contents.forEach(function(c) { c.classList.remove('active'); });

          this.classList.add('active');
          var targetEl = document.getElementById('tab-' + target);
          if (targetEl) { targetEl.classList.add('active'); }
        });
      });
    })();
  </script>
</body>
</html>`;
}
