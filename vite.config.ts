import { defineConfig } from 'vitest/config';

export default defineConfig({
  build: { target: 'es2022', chunkSizeWarningLimit: 1600 },
  worker: { format: 'es' },
  test: { projects: [
    { test: { name: '同時に', include: ['tests/**/*.test.ts'], setupFiles: ['tests/together.setup.ts'] } },
    { test: { name: '順番に', include: ['tests/flow.test.ts'], setupFiles: ['tests/sequential.setup.ts'] } },
  ] },
});
