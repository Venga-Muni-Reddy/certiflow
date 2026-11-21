import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    preserveSymlinks: true
  },
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 15000
  }
});
