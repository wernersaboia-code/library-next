// Laboratório de componentes reais, fora das rotas do aplicativo e sem banco/autenticação.
import { createServer } from 'node:http';
import { build } from 'esbuild';
import postcss from 'postcss';
import tailwind from 'tailwindcss';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const bundle = await build({
  entryPoints: ['test/browser/fixture.tsx'], bundle: true, write: false, platform: 'browser',
  jsx: 'automatic', define: { 'process.env': '{}', 'process.env.NODE_ENV': '"production"' },
  plugins: [{ name: 'test-router', setup(builder) {
    builder.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: path.resolve('test/browser/router.ts') }));
  } }],
});
const css = await postcss([tailwind()]).process(await readFile('app/globals.css', 'utf8'), { from: undefined });
const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  if (url.pathname === '/bundle.js') { res.setHeader('Content-Type', 'application/javascript'); res.end(bundle.outputFiles[0].contents); }
  else if (url.pathname === '/style.css') { res.setHeader('Content-Type', 'text/css'); res.end(css.css); }
  else if (url.pathname === '/cover.svg' || url.pathname === '/_next/image') {
    res.setHeader('Content-Type', 'image/svg+xml');
    // Mantém imagens pendentes durante a rolagem para exercitar lazy loading.
    setTimeout(() => res.end('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="300"><rect width="200" height="300" fill="#0369a1"/></svg>'), 150);
  } else {
    res.setHeader('Content-Type', 'text/html');
    res.end('<!doctype html><html lang="pt-BR" style="--font-titillium:Arial;--font-neuton:Georgia"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body class="font-sans"><div id="root"></div><script src="/bundle.js"></script></body></html>');
  }
});
server.listen(4173, '127.0.0.1');
