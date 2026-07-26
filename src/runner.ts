import { execFile } from 'child_process';
import * as vscode from 'vscode';
import { ValidationResult } from './types';

export interface RunResult {
  kind: 'passed' | 'failed' | 'error' | 'cancelled';
  result?: ValidationResult;
  errorMessage?: string;
}

/**
 * Executes the dbflow-validator CLI and parses its JSON output.
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
      const exitCode = error ? (error as NodeJS.ErrnoException & { code?: number }).code : 0;
      // execFile puts exit code in error.code as number or error.signal
      const numericExit = typeof exitCode === 'number' ? exitCode : (error?.killed ? 130 : getExitCode(error));

      switch (numericExit) {
        case 0:
        case 1: {
          try {
            const result: ValidationResult = JSON.parse(stdout);
            resolve({
              kind: numericExit === 0 ? 'passed' : 'failed',
              result,
            });
          } catch (parseError) {
            resolve({
              kind: 'error',
              errorMessage: `Failed to parse CLI output: ${parseError}\n\nstdout: ${stdout}\nstderr: ${stderr}`,
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
 * Extracts numeric exit code from an execFile error.
 */
function getExitCode(error: Error | null): number {
  if (!error) {
    return 0;
  }
  // Node's ChildProcess error includes 'code' as exit status number
  const code = (error as unknown as { status?: number }).status;
  if (typeof code === 'number') {
    return code;
  }
  return 2;
}
