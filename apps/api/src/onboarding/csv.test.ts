import { describe, expect, it } from 'vitest';
import { parseCsv, csvCell, writeCsv, MAX_BYTES } from './csv.js';

describe('bounded CSV parsing and safe spreadsheet exports', () => {
  it('reads UTF-8 BOM, CRLF, embedded commas, quotes and multiline fields', () => { expect(parseCsv('\uFEFFid,note\r\n1,"First, line\nSecond ""quoted"" line"\r\n')).toEqual([['id', 'note'], ['1', 'First, line\nSecond "quoted" line']]); });
  it.each(['id,id\n1,2', 'id,\n1,2', 'id\n"unterminated', 'id\nabc"def', 'id\n"value"junk', 'id', 'id\n\0'])('rejects malformed records: %s', (csv) => { expect(() => parseCsv(csv)).toThrow(); });
  it('bounds bytes, columns, rows and individual fields', () => { expect(() => parseCsv('a\n' + 'x'.repeat(MAX_BYTES))).toThrow(); expect(() => parseCsv(Array.from({ length: 41 }, (_, i) => `h${i}`).join(',') + '\n1')).toThrow(); expect(() => parseCsv('id\n' + 'x\n'.repeat(2001))).toThrow(); expect(() => parseCsv('id\n' + 'x'.repeat(8001))).toThrow(); expect(parseCsv('id\n' + 'x\n'.repeat(2000))).toHaveLength(2001); });
  it.each(['=HYPERLINK("https://example.test")', '+SUM(1,2)', '-1+1', '@SUM(A1)', '  =1', '\t=1', '\r=1', '\n=1'])('neutralizes formula prefix %j', (value) => { expect(csvCell(value)).toMatch(/^"'/); });
  it('round-trips ordinary CSV data without changing commas, quotes or Unicode', () => { expect(parseCsv(writeCsv(['id', 'name'], [['α', 'Comma, and "quote"'], ['b', 'Line\nbreak']]))).toEqual([['id', 'name'], ['α', 'Comma, and "quote"'], ['b', 'Line\nbreak']]); });
});
