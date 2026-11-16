import { reject } from '../auth/errors.js';

export const MAX_BYTES = 5 * 1024 * 1024;
export const MAX_ROWS = 2000;
// Strict comma-separated records: doubled quotes, quoted newlines, CRLF and BOM.
export function parseCsv(input: string): string[][] {
  const text = input.replace(/^\uFEFF/, '');
  if (Buffer.byteLength(text) > MAX_BYTES || text.includes('\0')) return reject(400, 'INVALID_CSV', 'CSV must be at most 5 MiB and contain no NUL characters');
  const records: string[][] = []; let row: string[] = []; let cell = ''; let quoted = false; let closed = false;
  const endCell = () => { row.push(cell); cell = ''; closed = false; if (row.length > 40) reject(400, 'INVALID_CSV', 'CSV supports at most 40 columns'); };
  const endRow = () => { endCell(); if (row.some((value) => value !== '')) records.push(row); row = []; if (records.length > MAX_ROWS + 1) reject(400, 'INVALID_CSV', 'CSV supports at most 2,000 data rows'); };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else { quoted = false; closed = true; } } else cell += ch; }
    else if (ch === ',') endCell();
    else if (ch === '\r' || ch === '\n') { if (ch === '\r' && text[i + 1] === '\n') i++; endRow(); }
    else if (ch === '"' && !cell && !closed) quoted = true;
    else if (closed || ch === '"') return reject(400, 'INVALID_CSV', 'Quotes must surround an entire CSV field');
    else cell += ch;
    if (cell.length > 8000) return reject(400, 'INVALID_CSV', 'A CSV field exceeds 8,000 characters');
  }
  if (quoted) return reject(400, 'INVALID_CSV', 'CSV contains an unterminated quoted field');
  if (row.length || cell || closed) endRow();
  if (records.length < 2) return reject(400, 'INVALID_CSV', 'Provide a header and at least one data row');
  const header = records[0]!.map((value) => value.trim());
  if (header.some((value) => !value) || new Set(header).size !== header.length) return reject(400, 'INVALID_CSV', 'Headers must be nonempty and unique');
  records[0] = header; return records;
}

export function csvCell(value: unknown) {
  let text = value == null ? '' : value instanceof Date ? value.toISOString() : String(value);
  // Escape formulas even when preceded by whitespace/control characters.
  // eslint-disable-next-line no-control-regex -- CSV spreadsheet safety explicitly includes control prefixes.
  if (/^[\s\u0000-\u001f]*[=+\-@]/.test(text) || /^[\t\r\n]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
export function writeCsv(headers: string[], rows: unknown[][]) { return '\uFEFF' + [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n'; }
