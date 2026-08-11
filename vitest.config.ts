import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'node',
    setupFiles: ['./test/setup.ts'],
    include: ['test/**/*.test.ts'],
    testTimeout: 30000,
    pool: 'forks',
    // Vitest 4 removed poolOptions.forks.singleFork; fileParallelism: false
    // is the supported replacement to run test files serially against the
    // shared test Postgres instance.
    fileParallelism: false,
  },
});
