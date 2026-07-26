import { execFile } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { ValidationResult } from './types';

export interface RunResult {
  kind: 'passed' | 'failed' | 'error' | 'cancelled';
  result?: ValidationResult;
  errorMessage?: string;
  runDir?: string;
}

/**
 * Executes the dbflow-validator CLI and parses its JSON output.
 *
 * The CLI outputs both console text (banner, progress) AND JSON to stdout.
 * We extract only the JSON block by finding the first '{' that starts a valid
 * JSON object.
 *
 * Exit codes:
 *  0   = PASSED
 *  1   = FAILED (validation errors found)
 *  2   = ERROR (CLI could not run properly)
 *  130 = CANCELLED (user interrupted)
 */
export function runValidator(binaryPath: string, workspaceFolder: string): Promise<RunResult> {
  const config = vscode.workspace.getConfiguration('dbflowValidator');
  const postgresImage = config.get<string>('postgresImage');

  const args = ['--output-format', 'json', '--log-level', 'error'];
  if (postgresImage) {
    args.push('--postgres-image', postgresImage);
  }

  return new Promise<RunResult>((resolve) => {
    execFile(binaryPath, args, { cwd: workspaceFolder, maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
      const numericExit = getExitCode(error);

      switch (numericExit) {
        case 0:
        case 1: {
          try {
            const jsonStr = extractJson(stdout);
            const raw = JSON.parse(jsonStr);
            const result = normalizeResult(raw);
            const runDir = findLatestRunDir(workspaceFolder);
            resolve({
              kind: numericExit === 0 ? 'passed' : 'failed',
              result,
              runDir,
            });
          } catch (parseError) {
            resolve({
              kind: 'error',
              errorMessage: `Failed to parse CLI output: ${parseError}\n\nstdout (last 500 chars): ${stdout.slice(-500)}\nstderr: ${stderr}`,
            });
          }
          break;
        }
        case 130:
          resolve({ kind: 'cancelled' });
          break;
        case 2:
        default:
          resolve({
            kind: 'error',
            errorMessage: stderr || stdout || (error?.message ?? 'Unknown error'),
          });
          break;
      }
    });
  });
}

/**
 * Extracts the JSON object from CLI stdout.
 * The CLI outputs banner + progress text before the JSON.
 * Strategy: find the last top-level JSON object in stdout (starts with '{' at line start
 * and ends with '}' at line start).
 */
function extractJson(stdout: string): string {
  // Find the last occurrence of a line starting with '{' — that's the JSON start
  const lines = stdout.split('\n');
  let jsonStart = -1;
  let braceDepth = 0;
  let jsonEnd = -1;

  // Scan backwards to find the last top-level '{' 
  for (let i = lines.length - 1; i >= 0; i--) {
    const trimmed = lines[i].trim();
    if (trimmed === '}' && jsonEnd === -1) {
      jsonEnd = i;
      braceDepth = 1;
    } else if (jsonEnd !== -1) {
      // Count braces to find matching open
      for (const ch of trimmed) {
        if (ch === '}') { braceDepth++; }
        if (ch === '{') { braceDepth--; }
      }
      if (braceDepth === 0) {
        jsonStart = i;
        break;
      }
    }
  }

  if (jsonStart === -1 || jsonEnd === -1) {
    // Fallback: try to find first '{' and last '}'
    const firstBrace = stdout.indexOf('{');
    const lastBrace = stdout.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      return stdout.substring(firstBrace, lastBrace + 1);
    }
    throw new Error('No JSON object found in CLI output');
  }

  return lines.slice(jsonStart, jsonEnd + 1).join('\n');
}

/**
 * Normalizes the raw CLI JSON to our ValidationResult interface.
 * The CLI uses: total_duration_ms (not duration_ms), PASSED (not 'passed' for status).
 */
function normalizeResult(raw: Record<string, unknown>): ValidationResult {
  return {
    status: raw.status as 'PASSED' | 'FAILED',
    steps: Array.isArray(raw.steps) ? raw.steps.map((s: Record<string, unknown>) => ({
      name: s.name as string,
      status: (s.status as string).toLowerCase() as 'passed' | 'failed' | 'skipped',
      message: s.trace as string | undefined,
      duration_ms: s.duration_ms as number | undefined,
      errors: s.errors as ValidationResult['steps'][0]['errors'],
    })) : [],
    summary: raw.summary as string || `${raw.status} — ${(raw.steps as unknown[])?.length ?? 0} steps`,
    total_duration_ms: (raw.total_duration_ms as number) ?? (raw.duration_ms as number) ?? 0,
  };
}

/**
 * Finds the most recently created run directory in dbflow-validator-runs/.
 */
function findLatestRunDir(workspaceFolder: string): string | undefined {
  const runsDir = path.join(workspaceFolder, 'dbflow-validator-runs');
  if (!fs.existsSync(runsDir)) {
    return undefined;
  }

  try {
    const entries = fs.readdirSync(runsDir);
    let latestDir: string | undefined;
    let latestTime = 0;

    for (const entry of entries) {
      const fullPath = path.join(runsDir, entry);
      try {
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory() && stat.mtimeMs > latestTime) {
          latestTime = stat.mtimeMs;
          latestDir = fullPath;
        }
      } catch {
        continue;
      }
    }

    return latestDir;
  } catch {
    return undefined;
  }
}

/**
 * Extracts numeric exit code from an execFile error.
 */
function getExitCode(error: Error | null): number {
  if (!error) {
    return 0;
  }
  if ((error as unknown as { killed?: boolean }).killed) {
    return 130;
  }
  const status = (error as unknown as { status?: number }).status;
  if (typeof status === 'number') {
    return status;
  }
  // Node sometimes puts it in code for ChildProcess errors
  const code = (error as unknown as { code?: number | string }).code;
  if (typeof code === 'number') {
    return code;
  }
  return 2;
}
