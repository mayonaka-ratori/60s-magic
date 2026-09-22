import { defineConfig } from 'vitest/config';

export default defineConfig({
  build: { target: 'es2022', chunkSizeWarningLimit: 1600 },
  worker: { format: 'es' },
  test: { projects: [
    { test: { name: '同時に', include: ['tests/**/*.test.ts'], setupFiles: ['tests/together.setup.ts'] } },
    // 新しい試験は両方の表で走らせる。外すのは「同時に」の秒数や、一回目で描く・防御で唱えることを前提に確かめている試験だけ。
    { test: { name: '順番に', include: ['tests/**/*.test.ts'], exclude: [
      'tests/composite.test.ts', 'tests/defend.test.ts', 'tests/enemy-audio.test.ts', 'tests/finish-audio.test.ts', 'tests/finish.test.ts',
      'tests/game.test.ts', 'tests/knight.test.ts', 'tests/local-speech.test.ts', 'tests/reaction-audio.test.ts',
    ], setupFiles: ['tests/sequential.setup.ts'] } },
  ] },
});
