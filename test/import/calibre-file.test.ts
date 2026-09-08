import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { readCalibreBookFile } from '@/lib/db/calibre-reader';

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'calibre-'));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('readCalibreBookFile', () => {
  it('prefere EPUB quando existe EPUB e PDF', () => {
    const livro = path.join(dir, 'Autor', 'Livro');
    fs.mkdirSync(livro, { recursive: true });
    fs.writeFileSync(path.join(livro, 'Livro.epub'), 'x');
    fs.writeFileSync(path.join(livro, 'Livro.pdf'), 'x');

    const file = readCalibreBookFile(dir, path.join('Autor', 'Livro'));
    expect(file?.format).toBe('epub');
    expect(file?.filePath).toBe(path.join(livro, 'Livro.epub'));
  });

  it('cai para PDF quando não há EPUB', () => {
    const livro = path.join(dir, 'Autor', 'Livro');
    fs.mkdirSync(livro, { recursive: true });
    fs.writeFileSync(path.join(livro, 'Livro.pdf'), 'x');

    const file = readCalibreBookFile(dir, path.join('Autor', 'Livro'));
    expect(file?.format).toBe('pdf');
  });

  it('devolve null quando não há arquivo legível', () => {
    const livro = path.join(dir, 'Autor', 'Livro');
    fs.mkdirSync(livro, { recursive: true });
    fs.writeFileSync(path.join(livro, 'cover.jpg'), 'x');

    expect(readCalibreBookFile(dir, path.join('Autor', 'Livro'))).toBeNull();
  });
});
