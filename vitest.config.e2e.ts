import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['test/*.e2e-spec.ts'],
    globalSetup: ['./test/global-setup.e2e.ts'],
    fileParallelism: false,
    testTimeout: 60000,
    hookTimeout: 60000,
    env: {
      E2E_MODE: 'testcontainers',
    },
  },
});
