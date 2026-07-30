import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Nada de este proyecto se testea en DOM: `domain/` es puro y `services/`
    // abre SQLite. La UI se valida a mano por quickstart.md.
    environment: 'node',
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
    // Cada test de integración abre su propia base en archivo temporal
    // (tests/helpers/db-temporal.ts, T018), así que no comparten estado.
    isolate: true,
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});
