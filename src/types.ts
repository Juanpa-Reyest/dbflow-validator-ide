/**
 * Interfaces for the JSON output produced by the dbflow-validator CLI.
 */

export interface ValidationResult {
  status: 'PASSED' | 'FAILED';
  steps: StepResult[];
  summary: string;
  duration_ms: number;
}

export interface StepResult {
  name: string;
  status: 'passed' | 'failed' | 'skipped';
  message?: string;
  errors?: ValidationError[];
}

export interface ValidationError {
  file?: string;
  line?: number;
  column?: number;
  rule?: string;
  message: string;
  severity: 'error' | 'warning';
}
