import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { pdfPageCount } from '@/lib/pdf-meta';

describe('pdfPageCount', () => {
  it('conta as páginas de um PDF válido', async () => {
    const buf = readFileSync('test/fixtures/exemplo.pdf');
    const ab = buf.buffer.slice(
      buf.byteOffset, buf.byteOffset + buf.byteLength
    ) as ArrayBuffer;
    expect(await pdfPageCount(ab)).toBe(3);
  });

  it('devolve null para arquivo que não é PDF', async () => {
    expect(await pdfPageCount(new TextEncoder().encode('nope').buffer))
      .toBeNull();
  });
});
