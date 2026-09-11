import { defineConfig } from 'vitest/config';

/** Eigene Vitest-Konfiguration, damit die Vite-Konfiguration schlank bleibt. */
export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/unit/**/*.test.{ts,tsx}'],
    css: false,
  },
});
