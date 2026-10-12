import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  test: {
    fileParallelism: false,
    projects: [
      {
        resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
        test: { name: 'unit', include: ['tests/unit/**/*.test.ts'], environment: 'node' },
      },
      {
        resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
        test: {
          name: 'integration',
          include: ['tests/integration/**/*.test.ts'],
          environment: 'node',
          testTimeout: 120_000,
          hookTimeout: 120_000,
        },
      },
    ],
  },
});
