/**
 * Numeric-safe spreadsheet formula injection sanitizer.
 * Protects CSV and XLSX exports against DDE/Formula injection payloads
 * while strictly preserving legitimate numeric values (e.g. -10, -0.25, +5).
 */

export function isPureNumeric(val: string): boolean {
  return /^[\+\-]?(?:[0-9]+(?:\.[0-9]+)?|\.[0-9]+)$/.test(val.trim());
}

export function sanitizeCsvField(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  const str = String(value);

  // If the string is a pure numeric literal, do not prepend apostrophe
  if (isPureNumeric(str)) {
    return str;
  }

  // Strip leading whitespace and ASCII control characters to detect trigger characters
  const trimmed = str.replace(/^[\s\x00-\x1F\x7F]+/, '');
  const formulaTriggers = ['=', '+', '-', '@', '\t', '\r'];

  if (formulaTriggers.some((trigger) => trimmed.startsWith(trigger))) {
    // Escape by prepending single quote and wrap in CSV double quotes
    return `"'${str.replace(/"/g, '""')}"`;
  }

  // Standard CSV escaping if contains comma, quote, or newline
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }

  return str;
}

export function sanitizeTextForSpreadsheet(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  const str = String(value);
  if (isPureNumeric(str)) {
    return str;
  }
  const trimmed = str.replace(/^[\s\x00-\x1F\x7F]+/, '');
  const formulaTriggers = ['=', '+', '-', '@', '\t', '\r'];
  if (formulaTriggers.some((trigger) => trimmed.startsWith(trigger))) {
    return `'${str}`;
  }
  return str;
}

