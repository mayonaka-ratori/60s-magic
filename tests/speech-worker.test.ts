import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, rmdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { LocalSpeech, defaultSpeechPython } from '../server/local-speech';
import { MAX_INPUT_SAMPLES } from '../src/game/rounds';

// NodeとPythonの本物の受け渡しを通す。認識モデルだけ試験用に置き換える。
vi.mock('node:child_process', async importOriginal => {
  const original = await importOriginal<typeof import('node:child_process')>();
  return { ...original, spawn: vi.fn((command: string, _args: string[], options: Parameters<typeof spawn>[2]) =>
    original.spawn(command, ['-X', 'utf8', resolve('tests/fixtures/speech-worker.py')], options)) };
});

const python = process.env.LOCAL_SPEECH_PYTHON || defaultSpeechPython();
describe.skipIf(!existsSync(python))('Python側の音声受付（setup:speechで用意したPythonを使用）', () => {
  it('14秒を超える音声も受け付け、ゲーム側の上限と不正な長さを区別する', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'magic-speech-worker-'));
    writeFileSync(join(directory, 'model.bin'), '試験用');
    const speech = new LocalSpeech(python, directory);
    try {
      speech.start();
      await vi.waitFor(() => expect(speech.getStatus().state).toBe('ready'), { timeout: 10000 });
      for (const bytes of [14 * 32000, 15 * 32000, 18 * 32000, MAX_INPUT_SAMPLES * 2]) {
        await expect(speech.recognize(Buffer.alloc(bytes))).resolves.toMatchObject({ text: '受付成功' });
      }
      for (const bytes of [0, 3, MAX_INPUT_SAMPLES * 2 + 2]) {
        await expect(speech.recognize(Buffer.alloc(bytes))).rejects.toThrow('音声を文字に変換できませんでした');
      }
      // 不正な要求の後も、次の音声を受け付ける。
      await expect(speech.recognize(Buffer.alloc(32000))).resolves.toMatchObject({ text: '受付成功' });
    } finally {
      speech.dispose();
      // この試験が作った、一時フォルダー直下のファイルだけを片付ける。
      rmSync(join(directory, 'model.bin'));
      rmdirSync(directory);
    }
  }, 15000);
});
