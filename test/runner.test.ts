import { describe, it, expect } from 'vitest';
import { ValidationResult } from '../src/types';

describe('runner', () => {
  describe('ValidationResult parsing', () => {
    it('should parse a PASSED result correctly', () => {
      const json: ValidationResult = {
        status: 'PASSED',
        steps: [
          {
            name: 'syntax-check',
            status: 'passed',
            message: 'All SQL files are syntactically valid',
          },
        ],
        summary: 'All 1 steps passed',
        total_duration_ms: 1234,
      };

      expect(json.status).toBe('PASSED');
      expect(json.steps).toHaveLength(1);
      expect(json.steps[0].status).toBe('passed');
      expect(json.total_duration_ms).toBe(1234);
    });

    it('should parse a FAILED result with errors', () => {
      const json: ValidationResult = {
        status: 'FAILED',
        steps: [
          {
            name: 'migration-apply',
            status: 'failed',
            message: 'Migration failed to apply',
            errors: [
              {
                file: 'migrations/001_create_users.sql',
                line: 5,
                column: 12,
                rule: 'syntax-error',
                message: 'syntax error at or near "CREAT"',
                severity: 'error',
              },
            ],
          },
        ],
        summary: '1 of 3 steps failed',
        total_duration_ms: 2345,
      };

      expect(json.status).toBe('FAILED');
      expect(json.steps[0].errors).toHaveLength(1);
      expect(json.steps[0].errors![0].file).toBe('migrations/001_create_users.sql');
      expect(json.steps[0].errors![0].severity).toBe('error');
    });

    it('should handle steps with no errors', () => {
      const json: ValidationResult = {
        status: 'PASSED',
        steps: [
          { name: 'docker-check', status: 'passed' },
          { name: 'syntax-check', status: 'skipped', message: 'No SQL files changed' },
        ],
        summary: 'All checks passed',
        total_duration_ms: 500,
      };

      expect(json.steps[0].errors).toBeUndefined();
      expect(json.steps[1].status).toBe('skipped');
    });
  });
});
