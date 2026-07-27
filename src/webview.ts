import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ValidationResult, StepResult } from './types';

let currentPanel: vscode.WebviewPanel | undefined;

// ─────────────────────────────────────────────────────────────────────────────
// Design tokens (dbflow-validator brand — keep in sync with the icon)
// ─────────────────────────────────────────────────────────────────────────────
const C = {
  bg: '#0b0d0f',
  chrome: '#0e1114',
  surface: '#101418',
  surfaceAlt: '#0e1216',
  line: '#1c2126',
  lineSoft: '#161b1f',
  text: '#e7ebec',
  textSoft: '#dfe5e7',
  muted: '#8b969c',
  faint: '#6f7b82',
  dim: '#4a545a',
  ok: '#4fe0a6',
  fail: '#f2555f',
};

const MONO = "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Consolas, monospace";

/** Execution phase for each known CLI step, shown next to its name. */
const PHASES: Record<string, string> = {
  preflight: 'preparación',
  clone: 'preparación',
  'engine-guard': 'preparación',
  overlay: 'preparación',
  'container-start': 'entorno',
  'readiness-probe': 'entorno',
  'schema-setup': 'entorno',
  'pom-driver-inject': 'entorno',
  'properties-patch': 'entorno',
  'pre-sync-validate': 'validación',
  'sql-rules-validator': 'validación',
  'dbflow:sync': 'validación',
  'dbflow:rollback': 'validación',
  cleanup: 'limpieza',
};

// ─────────────────────────────────────────────────────────────────────────────
// Public API — signature is backwards compatible; runDir is optional and only
// enables the "artefactos del run" card.
// ─────────────────────────────────────────────────────────────────────────────
export function showValidationReport(
  context: vscode.ExtensionContext,
  result: ValidationResult,
  scriptReportPath?: string,
  runDir?: string
): void {
  const column = vscode.ViewColumn.Beside;

  if (currentPanel) {
    currentPanel.reveal(column);
    currentPanel.webview.html = buildHtml(result, scriptReportPath, runDir);
    return;
  }

  const localResourceRoots: vscode.Uri[] = [];
  if (scriptReportPath && fs.existsSync(scriptReportPath)) {
    localResourceRoots.push(vscode.Uri.file(scriptReportPath));
  }

  currentPanel = vscode.window.createWebviewPanel(
    'dbflowValidatorReport',
    'DBFlow Validation Report',
    column,
    { enableScripts: true, retainContextWhenHidden: true, localResourceRoots }
  );

  currentPanel.onDidDispose(() => { currentPanel = undefined; }, null, context.subscriptions);

  // Clicking an artifact row opens the file in the editor.
  currentPanel.webview.onDidReceiveMessage(
    (msg: { command?: string; path?: string }) => {
      if (msg?.command === 'openFile' && msg.path && fs.existsSync(msg.path)) {
        vscode.window.showTextDocument(vscode.Uri.file(msg.path), { preview: true });
      }
    },
    null,
    context.subscriptions
  );
  currentPanel.webview.html = buildHtml(result, scriptReportPath, runDir);
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function formatDuration(ms: number): string {
  if (ms < 1000) { return `${ms}ms`; }
  const seconds = ms / 1000;
  if (seconds < 60) { return `${seconds % 1 === 0 ? seconds : seconds.toFixed(1)}s`; }
  const m = Math.floor(seconds / 60);
  return `${m}m ${Math.round(seconds % 60)}s`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) { return `${bytes} B`; }
  if (bytes < 1024 * 1024) { return `${(bytes / 1024).toFixed(1)} KB`; }
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Brand icon: stacked DB discs + verdict seal. */
function svgBrand(size: number, seal: string): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 32 32" fill="none" aria-hidden="true">
    <ellipse cx="15" cy="7.5" rx="10.5" ry="3.6" stroke="${C.text}" stroke-width="2"/>
    <ellipse cx="15" cy="15" rx="10.5" ry="3.6" stroke="${C.text}" stroke-width="2"/>
    <ellipse cx="15" cy="22.5" rx="10.5" ry="3.6" stroke="${C.text}" stroke-width="2"/>
    <circle cx="24" cy="24" r="7" fill="${C.bg}"/>
    <circle cx="24" cy="24" r="5.6" fill="${seal}"/>
    <path d="M21.4 24.1 L23.3 26 L26.7 22.2" stroke="${C.bg}" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
}

/** Reads report.json from the run dir for values the CLI resolved (branch, repo…). */
function readReportMeta(runDir?: string): Record<string, unknown> {
  if (!runDir) { return {}; }
  try {
    const p = path.join(runDir, 'report.json');
    if (fs.existsSync(p)) { return JSON.parse(fs.readFileSync(p, 'utf-8')); }
  } catch { /* ignore — the panel must render regardless */ }
  return {};
}

function buildEmbeddedScriptReport(scriptReportPath: string): string | null {
  const htmlPath = path.join(scriptReportPath, 'validation_report.html');
  const cssPath = path.join(scriptReportPath, 'css', 'styles.css');
  const jsPath = path.join(scriptReportPath, 'js', 'app.js');
  if (!fs.existsSync(htmlPath)) { return null; }

  let html = fs.readFileSync(htmlPath, 'utf-8');
  html = html.replace('data-theme="light"', 'data-theme="dark"');
  if (fs.existsSync(cssPath)) {
    html = html.replace(/<link[^>]*href=["']css\/styles\.css["'][^>]*\/?>/i,
      `<style>${fs.readFileSync(cssPath, 'utf-8')}</style>`);
  }
  if (fs.existsSync(jsPath)) {
    html = html.replace(/<script[^>]*src=["']js\/app\.js["'][^>]*><\/script>/i,
      `<script>${fs.readFileSync(jsPath, 'utf-8')}</script>`);
  }
  html = html.replace(/<button[^>]*id=["']themeToggle["'][^>]*>[\s\S]*?<\/button>/i, '');
  return html;
}

// ─────────────────────────────────────────────────────────────────────────────
// Fragments
// ─────────────────────────────────────────────────────────────────────────────
function metric(label: string, value: string, color = C.text): string {
  return `<div class="metric">
    <span class="metric-label">${escapeHtml(label)}</span>
    <span class="metric-value" style="color:${color}">${value}</span>
  </div>`;
}

function param(label: string, value: string, badge?: string): string {
  return `<div class="param">
    <span class="param-label">${escapeHtml(label)}${badge ? `<span class="param-badge">${escapeHtml(badge)}</span>` : ''}</span>
    <span class="param-value">${escapeHtml(value)}</span>
  </div>`;
}

function stepRow(step: StepResult, index: number): string {
  const status = step.status.toLowerCase();
  const failed = status === 'failed';
  const skipped = status === 'skipped';
  const glyph = failed ? '✕' : skipped ? '·' : '✔';
  const color = failed ? C.fail : skipped ? C.dim : C.ok;
  const nameColor = failed ? C.fail : skipped ? '#5b656b' : C.textSoft;
  const duration = skipped || step.duration_ms === undefined ? '—' : formatDuration(step.duration_ms);
  const phase = PHASES[step.name] ?? 'proceso';

  return `<div class="step-row"${failed ? ' data-failed="true"' : ''}>
    <span class="step-num">#${String(index + 1).padStart(2, '0')}</span>
    <span class="step-glyph" style="color:${color}">${glyph}</span>
    <span class="step-name" style="color:${nameColor}" title="${escapeHtml(step.name)}">${escapeHtml(step.name)}</span>
    <span class="step-phase">${escapeHtml(phase)}</span>
    <span class="step-duration" style="color:${skipped ? C.dim : C.muted}">${duration}</span>
  </div>`;
}

/** Full-width failure block: which step broke and the trace, unabridged. */
function failureBlock(result: ValidationResult): string {
  const idx = result.steps.findIndex(s => s.status.toLowerCase() === 'failed');
  if (idx === -1) { return ''; }
  const step = result.steps[idx];
  const headline = step.errors?.[0]?.message ?? step.message ?? 'El paso terminó con error';
  const trace = (step.message ?? step.errors?.map(e => e.message).join('\n') ?? '').trim();

  return `<div class="failure">
    <div class="failure-head">
      <span class="failure-tag">#${String(idx + 1).padStart(2, '0')} FAILED</span>
      <span class="failure-step">${escapeHtml(step.name)}</span>
      <span class="failure-reason">${escapeHtml(headline.split('\n')[0].substring(0, 140))}</span>
    </div>
    ${trace ? `<pre class="failure-trace">${escapeHtml(trace)}</pre>` : ''}
    <span class="failure-note">workspace retenido para inspección · nada se envió a remoto</span>
  </div>`;
}

function artifactsCard(runDir?: string): string {
  const files = ['report.json', 'execution.log', 'maven-output.log'];
  const rows = files.map(name => {
    const full = runDir ? path.join(runDir, name) : '';
    let size = '—';
    if (full && fs.existsSync(full)) {
      try { size = formatBytes(fs.statSync(full).size); } catch { /* keep — */ }
    }
    const exists = size !== '—';
    return `<div class="artifact"${exists ? ` data-open="${escapeHtml(full)}"` : ' data-missing="true"'}>
      <span>${name}</span><span class="artifact-size">${size}</span>
    </div>`;
  }).join('');

  return `<section class="card">
    <header class="card-head"><span class="card-title">artefactos del run</span></header>
    <div class="card-lead">
      <span class="param-label">output-dir</span>
      <span class="param-value dim">${escapeHtml(runDir ?? 'no disponible para este run')}</span>
    </div>
    <div class="artifacts">${rows}</div>
  </section>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// HTML
// ─────────────────────────────────────────────────────────────────────────────
function buildHtml(result: ValidationResult, scriptReportPath?: string, runDir?: string): string {
  const passed = result.status === 'PASSED';
  const accent = passed ? C.ok : C.fail;
  const meta = readReportMeta(runDir);
  const cfg = vscode.workspace.getConfiguration('dbflowValidator');

  const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '—';
  const branch = (meta.base_branch as string) ?? path.basename(workspacePath);
  const repoUrl = (meta.repo_url as string) ?? '—';
  const timestamp = (meta.timestamp as string)?.replace('T', ' ').substring(0, 19)
    ?? new Date().toISOString().replace('T', ' ').substring(0, 19);
  const runId = runDir ? path.basename(runDir) : timestamp.replace(/[: ]/g, '-');
  const okCount = result.steps.filter(s => s.status.toLowerCase() === 'passed').length;
  const workspaceState = passed ? 'eliminado' : 'retenido';

  const stepsHtml = result.steps.map(stepRow).join('');
  const summary = passed
    ? `total ${formatDuration(result.total_duration_ms)} · ${result.steps.length} pasos`
    : `total ${formatDuration(result.total_duration_ms)} · se detuvo en el paso #${String(result.steps.findIndex(s => s.status.toLowerCase() === 'failed') + 1).padStart(2, '0')}`;

  let scriptReport = '<div class="empty">Este run no generó reporte de calidad</div>';
  if (scriptReportPath) {
    const embedded = buildEmbeddedScriptReport(scriptReportPath);
    if (embedded) { scriptReport = `<div class="script-report-frame">${embedded}</div>`; }
  }

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>DBFlow Validation Report</title>
<style>
  *, *::before, *::after { box-sizing: border-box; }
  body { margin: 0; background: ${C.bg}; color: ${C.text}; font-family: ${MONO}; font-size: 13px; line-height: 1.6; }
  a { color: ${accent}; text-decoration: none; }

  /* header */
  .top { display: flex; align-items: flex-start; gap: 28px; padding: 30px 32px 24px; flex-wrap: wrap; }
  .brand { display: flex; align-items: center; gap: 14px; flex-shrink: 0; }
  .brand-name { font-size: 20px; font-weight: 500; letter-spacing: -0.02em; white-space: nowrap; }
  .brand-run { font-size: 12px; color: ${C.faint}; white-space: nowrap; }
  .pill { font-size: 11px; color: ${C.faint}; border: 1px solid #2a3036; border-radius: 4px; padding: 2px 6px; white-space: nowrap; }

  .metrics { flex: 1 1 380px; display: grid; grid-template-columns: repeat(4, 1fr); gap: 1px; background: ${C.line}; border: 1px solid ${C.line}; border-radius: 10px; overflow: hidden; }
  .metric { background: ${C.surface}; padding: 12px 16px; display: flex; flex-direction: column; gap: 4px; }
  .metric-label { font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase; color: ${C.faint}; white-space: nowrap; }
  .metric-value { font-size: 15px; white-space: nowrap; }

  .verdict-wrap { display: flex; flex-direction: column; align-items: flex-end; gap: 8px; flex-shrink: 0; }
  .verdict { display: flex; align-items: center; gap: 11px; padding: 12px 20px; border-radius: 10px;
    background: ${passed ? 'rgba(79,224,166,0.10)' : 'rgba(242,85,95,0.10)'};
    border: 1px solid ${passed ? 'rgba(79,224,166,0.45)' : 'rgba(242,85,95,0.45)'}; }
  .verdict-glyph { font-size: 16px; color: ${accent}; }
  .verdict-text { font-size: 18px; font-weight: 700; letter-spacing: 0.06em; color: ${accent}; }
  .verdict-note { font-size: 11px; color: ${C.faint}; }

  /* tabs */
  .tabs { display: flex; gap: 0; padding: 0 32px; border-bottom: 1px solid ${C.line}; }
  .tab { background: none; border: none; border-bottom: 2px solid transparent; color: ${C.faint};
    font-family: inherit; font-size: 12px; letter-spacing: 0.04em; padding: 12px 16px; cursor: pointer; }
  .tab:hover { color: ${C.text}; }
  .tab.active { color: ${C.text}; border-bottom-color: ${accent}; }
  .panel { display: none; }
  .panel.active { display: block; }

  /* layout */
  .grid { display: grid; grid-template-columns: minmax(0, 1fr) 400px; gap: 22px; padding: 24px 32px 32px; align-items: start; }
  @media (max-width: 1080px) { .grid { grid-template-columns: minmax(0, 1fr); } }
  @media (max-width: 900px) {
    .top { flex-direction: column; gap: 16px; padding: 20px 16px 16px; }
    .metrics { grid-template-columns: repeat(2, 1fr); flex: none; }
    .verdict-wrap { align-items: flex-start; }
    .grid { padding: 16px; }
    .foot { flex-direction: column; align-items: flex-start; gap: 12px; padding: 14px 16px; }
    .tabs { padding: 0 16px; }
    .step-row { grid-template-columns: 32px 14px minmax(0, 1fr) 60px; gap: 8px; padding: 0 12px; }
    .step-phase { display: none; }
  }
  .card { background: ${C.surface}; border: 1px solid ${C.line}; border-radius: 12px; overflow: hidden; }
  .card + .card { margin-top: 22px; }
  .card-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 15px 20px; border-bottom: 1px solid ${C.line}; }
  .card-title { font-size: 11.5px; letter-spacing: 0.16em; text-transform: uppercase; color: ${C.text}; }
  .card-meta { font-size: 10.5px; color: ${C.faint}; white-space: nowrap; }
  .count { font-size: 11px; font-weight: 700; color: ${C.bg}; background: ${accent}; border-radius: 4px; padding: 2px 7px; }

  /* steps */
  .step-row { display: grid; grid-template-columns: 40px 16px minmax(0, 1fr) 120px 78px; align-items: center; gap: 14px;
    padding: 0 20px; height: 44px; border-bottom: 1px solid ${C.lineSoft}; }
  .step-row:hover { background: #131a1e; }
  .step-row[data-failed] { background: rgba(242,85,95,0.07); }
  .step-num { font-size: 11px; color: ${C.dim}; }
  .step-glyph { font-size: 13px; text-align: center; }
  .step-name { font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .step-phase { font-size: 10.5px; letter-spacing: 0.1em; text-transform: uppercase; color: ${C.dim}; white-space: nowrap; }
  .step-duration { font-size: 12px; text-align: right; }
  .steps-foot { display: flex; align-items: center; gap: 20px; padding: 14px 20px; background: ${C.surfaceAlt}; font-size: 11px; color: ${C.faint}; }

  /* failure */
  .failure { display: flex; flex-direction: column; gap: 12px; padding: 20px; background: rgba(242,85,95,0.06); border-top: 1px solid rgba(242,85,95,0.3); }
  .failure-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .failure-tag { font-size: 11px; font-weight: 700; color: ${C.bg}; background: ${C.fail}; border-radius: 4px; padding: 2px 7px; }
  .failure-step { font-size: 13px; color: ${C.fail}; }
  .failure-reason { font-size: 11px; color: ${C.muted}; }
  .failure-trace { margin: 0; font-family: ${MONO}; font-size: 12px; line-height: 1.8; color: #c8d0d3;
    background: ${C.bg}; border: 1px solid #22282d; border-radius: 8px; padding: 14px 16px; max-height: 320px; overflow: auto; white-space: pre-wrap; word-break: break-word; }
  .failure-note { font-size: 11px; color: ${C.faint}; }

  /* parametría */
  .param { display: flex; flex-direction: column; gap: 4px; padding: 12px 20px; border-bottom: 1px solid ${C.lineSoft}; }
  .param-label { display: flex; align-items: center; gap: 8px; font-size: 10.5px; color: ${C.faint}; }
  .param-badge { font-size: 9.5px; color: ${accent}; border: 1px solid ${passed ? 'rgba(79,224,166,0.35)' : 'rgba(242,85,95,0.35)'}; border-radius: 3px; padding: 1px 5px; }
  .param-value { font-size: 12px; color: ${C.textSoft}; word-break: break-all; }
  .param-value.dim { color: ${C.muted}; font-size: 11.5px; }
  .param-pair { display: grid; grid-template-columns: 1fr 1fr; gap: 1px; background: ${C.lineSoft}; }
  .param-pair .param { background: ${C.surface}; border-bottom: none; }
  .secret { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 20px; background: ${C.surfaceAlt}; }
  .secret-dots { font-size: 12.5px; color: ${C.muted}; letter-spacing: 0.18em; }

  /* artifacts */
  .card-lead { display: flex; flex-direction: column; gap: 4px; padding: 13px 20px 8px; }
  .artifacts { display: flex; flex-direction: column; padding: 4px 8px 12px; }
  .artifact { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 12px; border-radius: 8px; font-size: 12.5px; color: ${C.textSoft}; cursor: pointer; }
  .artifact:hover { background: #151b20; color: ${accent}; }
  .artifact[data-missing] { color: ${C.dim}; cursor: default; }
  .artifact[data-missing]:hover { background: none; color: ${C.dim}; }
  .artifact-size { font-size: 11px; color: #5f6a70; }

  /* footer + signature */
  .foot { display: flex; align-items: center; justify-content: space-between; gap: 24px; padding: 18px 32px 24px; border-top: 1px solid #1a1f24; background: ${C.chrome}; flex-wrap: wrap; }
  .foot-meta { font-size: 11px; color: ${C.dim}; }
  .sign { display: flex; align-items: center; gap: 13px; }
  .sign-mark { display: flex; align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: 7px; border: 1px solid #2a3036; background: ${C.bg}; font-size: 11px; font-weight: 700; color: ${C.ok}; }
  .sign-name { font-size: 12.5px; font-weight: 500; color: ${C.textSoft}; white-space: nowrap; }
  .sign-role { font-size: 10px; letter-spacing: 0.16em; text-transform: uppercase; color: ${C.faint}; white-space: nowrap; }

  .empty { padding: 60px 32px; text-align: center; color: ${C.faint}; }
  .script-report-frame { all: initial; display: block; width: 100%; min-height: 400px; font-family: sans-serif; color-scheme: dark; }
  .script-report-frame * { all: revert; }

  ::-webkit-scrollbar { width: 8px; height: 8px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: #22282d; border-radius: 4px; }
  ::-webkit-scrollbar-thumb:hover { background: #2f373d; }
</style>
</head>
<body>
  <div class="top">
    <div class="brand">
      ${svgBrand(42, C.ok)}
      <div>
        <div style="display:flex;align-items:center;gap:10px;">
          <span class="brand-name">dbflow-validator</span>
          <span class="pill">v0.3.2</span>
        </div>
        <div class="brand-run">run ${escapeHtml(runId)}</div>
      </div>
    </div>

    <div class="metrics">
      ${metric('duración', formatDuration(result.total_duration_ms))}
      ${metric('pasos', `${okCount}<span style="color:${C.faint};font-size:12px">/${result.steps.length}</span>`, accent)}
      ${metric('rama base', escapeHtml(branch))}
      ${metric('workspace', workspaceState, passed ? C.text : C.fail)}
    </div>

    <div class="verdict-wrap">
      <div class="verdict">
        <span class="verdict-glyph">${passed ? '✔' : '✕'}</span>
        <span class="verdict-text">${result.status}</span>
      </div>
      <span class="verdict-note">${passed ? 'sin cambios enviados a remoto' : 'nada se envió a remoto'}</span>
    </div>
  </div>

  <div class="tabs">
    <button class="tab active" data-tab="pipeline">Pipeline</button>
    <button class="tab" data-tab="quality">Reporte de calidad</button>
  </div>

  <div class="panel active" id="tab-pipeline">
    <div class="grid">
      <section class="card">
        <header class="card-head">
          <span style="display:flex;align-items:center;gap:10px;">
            <span class="card-title">validation steps</span>
            <span class="count">${result.steps.length}</span>
          </span>
          <span class="card-meta">ordenado por ejecución</span>
        </header>
        ${stepsHtml}
        ${failureBlock(result)}
        <div class="steps-foot"><span>${escapeHtml(summary)}</span></div>
      </section>

      <div>
        <section class="card">
          <header class="card-head">
            <span class="card-title">parametría</span>
            <span class="card-meta">flags &gt; env &gt; prompt</span>
          </header>
          ${param('repo-url', repoUrl, repoUrl !== '—' ? 'auto' : undefined)}
          <div class="param-pair">
            ${param('base-branch', branch)}
            ${param('log-level', cfg.get<string>('logLevel') ?? 'error')}
            ${param('output-format', 'json')}
            ${param('keep-workspace', passed ? 'false' : 'true')}
          </div>
          ${param('workspace', workspacePath)}
          ${param('postgres-image', cfg.get<string>('postgresImage') ?? 'default (dbflow-postgres-partman)')}
          <div class="secret">
            <span style="display:flex;flex-direction:column;gap:4px;">
              <span class="param-label">git-token</span>
              <span class="secret-dots">••••••••••••</span>
            </span>
            <span class="pill">nunca en disco</span>
          </div>
        </section>

        ${artifactsCard(runDir)}
      </div>
    </div>

    <div class="foot">
      <span class="foot-meta">${escapeHtml(timestamp)} · reporte generado localmente</span>
      <div class="sign">
        <span class="sign-mark">JR</span>
        <span style="display:flex;flex-direction:column;gap:2px;">
          <span class="sign-name">Juanpa Reyest</span>
          <span class="sign-role">Development Engineer</span>
        </span>
      </div>
    </div>
  </div>

  <div class="panel" id="tab-quality">${scriptReport}</div>

  <script>
    (function () {
      const vscodeApi = typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : null;

      document.querySelectorAll('.tab').forEach(function (tab) {
        tab.addEventListener('click', function () {
          document.querySelectorAll('.tab').forEach(function (t) { t.classList.remove('active'); });
          document.querySelectorAll('.panel').forEach(function (p) { p.classList.remove('active'); });
          tab.classList.add('active');
          const target = document.getElementById('tab-' + tab.getAttribute('data-tab'));
          if (target) { target.classList.add('active'); }
        });
      });

      document.querySelectorAll('.artifact[data-open]').forEach(function (el) {
        el.addEventListener('click', function () {
          if (vscodeApi) { vscodeApi.postMessage({ command: 'openFile', path: el.getAttribute('data-open') }); }
        });
      });
    })();
  </script>
</body>
</html>`;
}
