/**
 * Interfaces for the JSON output produced by the dbflow-validator CLI.
 *
 * The CLI outputs a JSON object with:
 * - status: "PASSED" | "FAILED" (uppercase)
 * - total_duration_ms: number (NOT duration_ms)
 * - steps[].status: "PASSED" | "FAILED" | "SKIPPED" (uppercase from CLI, normalized to lowercase in runner.ts)
 * - steps[].duration_ms: number
 * - steps[].trace: string (detailed output of the step)
 */

export interface ValidationResult {
  status: 'PASSED' | 'FAILED';
  steps: StepResult[];
  summary: string;
  total_duration_ms: number;
}

export interface StepResult {
  name: string;
  status: 'passed' | 'failed' | 'skipped';
  message?: string;
  duration_ms?: number;
  errors?: ValidationError[];
}

export interface ValidationError {
  file?: string;
  line?: number;
  column?: number;
  rule?: string;
  message: string;
  severity: 'error' | 'warning' | 'blocker' | 'major' | 'minor' | 'info';
}
