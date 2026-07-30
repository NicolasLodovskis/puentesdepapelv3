import { FlatCompat } from '@eslint/eslintrc';
import prettier from 'eslint-config-prettier';

const compat = new FlatCompat();

const config = [
  {
    ignores: ['node_modules/**', '.next/**', 'out/**', 'build/**', 'coverage/**', 'next-env.d.ts'],
  },
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    rules: {
      // El Principio II prohíbe inventar datos: una variable de resultado sin
      // usar suele ser un error o un valor que se descarta en silencio.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // `any` desactiva las garantías del compilador justo donde entran datos
      // externos (celdas de Excel, filas de SQLite), que es donde más importan.
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  // Prettier va último: apaga las reglas de estilo que chocarían con el formato.
  prettier,
];

export default config;
