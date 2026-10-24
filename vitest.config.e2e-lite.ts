import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['test/*.e2e-spec.ts'],
    fileParallelism: false,
    env: {
      E2E_MODE: 'lite',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'clover', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.spec.ts',
        'src/main.ts',
        'test/**',
      ],
    },
  },
});
