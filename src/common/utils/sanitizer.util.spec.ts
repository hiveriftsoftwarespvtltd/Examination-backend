import {
  sanitizeCsvField,
  sanitizeTextForSpreadsheet,
  isPureNumeric,
} from './sanitizer.util';

describe('SanitizerUtil - Spreadsheet Security', () => {
  describe('isPureNumeric', () => {
    it('should correctly identify pure numeric strings', () => {
      expect(isPureNumeric('100')).toBe(true);
      expect(isPureNumeric('-10')).toBe(true);
      expect(isPureNumeric('+5')).toBe(true);
      expect(isPureNumeric('-0.25')).toBe(true);
      expect(isPureNumeric('3.14159')).toBe(true);
      expect(isPureNumeric('.5')).toBe(true);
      expect(isPureNumeric('-.75')).toBe(true);
    });

    it('should reject non-numeric formulas and text', () => {
      expect(isPureNumeric('=cmd|/C calc')).toBe(false);
      expect(isPureNumeric('+SUM(A1:A10)')).toBe(false);
      expect(isPureNumeric('-2+3*4')).toBe(false);
      expect(isPureNumeric('@HYPERLINK("http://evil.com")')).toBe(false);
      expect(isPureNumeric('John Doe')).toBe(false);
    });
  });

  describe('sanitizeCsvField', () => {
    it('should preserve legitimate numbers without prepending quotes', () => {
      expect(sanitizeCsvField(-10)).toBe('-10');
      expect(sanitizeCsvField('-0.25')).toBe('-0.25');
      expect(sanitizeCsvField('+5')).toBe('+5');
      expect(sanitizeCsvField('100')).toBe('100');
      expect(sanitizeCsvField('-50')).toBe('-50');
    });

    it('should escape dangerous formula prefixes in text fields', () => {
      expect(sanitizeCsvField('=1+1')).toBe(`"'=1+1"`);
      expect(sanitizeCsvField('@SUM(1+1)')).toBe(`"'@SUM(1+1)"`);
      expect(sanitizeCsvField('+SUM(A1:A10)')).toBe(`"'+SUM(A1:A10)"`);
      expect(sanitizeCsvField('=cmd|\' /C calc\'!A0')).toBe(`"'=cmd|' /C calc'!A0"`);
    });

    it('should detect formula triggers with leading whitespace or control characters', () => {
      expect(sanitizeCsvField('   =cmd|')).toBe(`"'   =cmd|"`);
      expect(sanitizeCsvField('\t=1+1')).toBe(`"'\t=1+1"`);
      expect(sanitizeCsvField('\r@test')).toBe(`"'\r@test"`);
    });

    it('should escape strings containing commas, quotes, or newlines', () => {
      expect(sanitizeCsvField('Engineering, Platform')).toBe('"Engineering, Platform"');
      expect(sanitizeCsvField('He said "Hello"')).toBe('"He said ""Hello"""');
    });
  });

  describe('sanitizeTextForSpreadsheet', () => {
    it('should prepend apostrophe to formula triggers in text', () => {
      expect(sanitizeTextForSpreadsheet('=SUM(A1:A5)')).toBe(`'=SUM(A1:A5)`);
      expect(sanitizeTextForSpreadsheet('-5+2')).toBe(`'-5+2`);
    });

    it('should not mutate pure negative numbers', () => {
      expect(sanitizeTextForSpreadsheet('-10')).toBe('-10');
      expect(sanitizeTextForSpreadsheet('-0.5')).toBe('-0.5');
    });
  });
});

