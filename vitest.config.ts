import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  // Resolves the path aliases declared in tsconfig.json, including the ones
  // added by `nest g library`.
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['**/*.spec.ts', 'test/*.e2e-spec.ts'],
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
