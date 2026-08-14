import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  resolve: {
    alias: {
      // O Next.js substitui `server-only` por um módulo que lança erro
      // fora de Server Components; o Vitest não tem esse bundler, então
      // aliasamos para um shim vazio só nos testes.
      'server-only': fileURLToPath(
        new URL('./test/mocks/server-only.ts', import.meta.url)
      ),
    },
  },
  test: {
    environment: 'node',
    setupFiles: ['./test/setup.ts'],
    include: ['test/**/*.test.ts'],
    testTimeout: 30000,
    // O `beforeAll` das suítes de banco cria um schema e aplica TODAS as
    // migrations contra o Postgres remoto. O padrão de 10s foi ficando
    // apertado a cada migration nova e passou a estourar na 0013.
    hookTimeout: 60000,
    pool: 'forks',
    // Vitest 4 removed poolOptions.forks.singleFork; fileParallelism: false
    // is the supported replacement to run test files serially against the
    // shared test Postgres instance.
    fileParallelism: false,
  },
});
