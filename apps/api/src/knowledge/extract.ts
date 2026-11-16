import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';

export function validateManual(bytes: Buffer, mediaType: string) {
  if (!bytes.length || bytes.length > 5 * 1024 * 1024) throw new Error('MANUAL_SIZE');
  if (mediaType === 'application/pdf') { if (bytes.subarray(0, 5).toString() !== '%PDF-') throw new Error('MANUAL_SIGNATURE'); }
  else if (mediaType === 'text/plain') { const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); if (text.includes('\0') || !text.trim()) throw new Error('MANUAL_TEXT'); }
  else throw new Error('MANUAL_TYPE');
}
export async function extractPages(bytes: Buffer, mediaType: string): Promise<string[]> {
  validateManual(bytes, mediaType);
  if (mediaType === 'text/plain') return [new TextDecoder('utf-8', { fatal: true }).decode(bytes)];
  return new Promise((resolve, reject) => {
    let parser = fileURLToPath(new URL('./pdf-extractor.js', import.meta.url)); if (!existsSync(parser)) parser = fileURLToPath(new URL('../../dist/knowledge/pdf-extractor.js', import.meta.url));
    const child = spawn(process.execPath, ['--max-old-space-size=256', parser], { shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] }); let output = ''; let settled = false;
    const fail = () => { if (!settled) { settled = true; reject(new Error('PDF_EXTRACTION_FAILED_OR_LIMIT')); } };
    const timer = setTimeout(() => { child.kill('SIGKILL'); fail(); }, 20000);
    child.stdout.on('data', (chunk: Buffer) => { output += chunk.toString(); if (output.length > 1100000) { child.kill('SIGKILL'); fail(); } }); child.stdin.on('error', fail); child.on('error', fail);
    child.on('close', (code) => { clearTimeout(timer); if (settled) return; if (code !== 0) return fail(); try { const data: unknown = JSON.parse(output); if (!Array.isArray(data) || !data.every((value) => typeof value === 'string')) return fail(); settled = true; resolve(data); } catch { fail(); } }); child.stdin.end(bytes);
  });
}
export function chunkPages(pages: string[]) { if (pages.length > 100 || pages.join('').length > 1000000) throw new Error('MANUAL_TEXT_LIMIT'); const chunks: { page: number; ordinal: number; content: string }[] = []; for (let p = 0; p < pages.length; p++) { const text = pages[p]!.replace(/\r\n/g, '\n').trim(); for (let start = 0; start < text.length; start += 1600) { chunks.push({ page: p + 1, ordinal: chunks.length, content: text.slice(start, start + 1800) }); if (chunks.length > 500) throw new Error('MANUAL_CHUNK_LIMIT'); } } if (!chunks.length) throw new Error('MANUAL_NO_TEXT_OCR_REQUIRED'); return chunks; }
export const fileHash = (data: Buffer) => createHash('sha256').update(data).digest('hex');
