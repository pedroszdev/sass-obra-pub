import { defineConfig } from 'vitest/config';

// Testes unitários de lógica pura (sem DOM) — por isso environment 'node'.
// Config separada da vite.config para não carregar o plugin React nos testes.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
