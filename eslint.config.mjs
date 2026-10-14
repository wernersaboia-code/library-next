import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { FlatCompat } from '@eslint/eslintrc';
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

const compat = new FlatCompat({
  baseDirectory: fileURLToPath(new URL('.', import.meta.url)),
  // Os plugins são dependências do eslint-config-next. Com pnpm, eles não
  // ficam necessariamente disponíveis na raiz do projeto.
  resolvePluginsRelativeTo: dirname(fileURLToPath(import.meta.resolve('eslint-config-next'))),
});

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...compat.extends('next/core-web-vitals'),
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'lib/db/migrations/**',
      'public/**',
      'next-env.d.ts',
    ],
  },
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_' },
      ],
    },
  }
);
