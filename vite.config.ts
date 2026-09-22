import { defineConfig } from 'vitest/config';

export default defineConfig({
  build: { target: 'es2022', chunkSizeWarningLimit: 1600 },
  worker: { format: 'es' },
  test: { projects: [
    { test: { name: '同時に', include: ['tests/**/*.test.ts'], setupFiles: ['tests/together.setup.ts'] } },
    { test: { name: '順番に', include: [
      'tests/flow.test.ts', 'tests/spell-layout.test.ts', 'tests/guard-effects.test.ts',
      'tests/charge.test.ts', 'tests/release.test.ts', 'tests/impact.test.ts',
      'tests/finish-effects.test.ts', 'tests/live-words.test.ts',
    ], setupFiles: ['tests/sequential.setup.ts'] } },
  ] },
});
