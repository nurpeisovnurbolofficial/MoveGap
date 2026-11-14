import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.{ts,tsx}', 'server/**/*.test.ts'],
    // Embedded PostgreSQL uses WASM; bound memory on laptops and CI runners.
    maxWorkers: 1, fileParallelism: false,
    testTimeout: 30000, hookTimeout: 30000,
  },
});
