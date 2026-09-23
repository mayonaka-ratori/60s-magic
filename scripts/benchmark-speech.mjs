// 準備できている認識モデルの速さを測る。引数でモデル名を選べる。
// 声を待つ時間と声の最長は src/game/rounds.ts の値をそのまま渡す。Python側には数字を書かない。
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { MAX_INPUT_MS, SPEECH_WAIT_MS } from '../src/game/rounds.ts';

const python = resolve(process.platform === 'win32' ? '.venv-speech/Scripts/python.exe' : '.venv-speech/bin/python');
if (!existsSync(python)) {
  console.error('先に npm run setup:speech で音声認識を準備してください。');
  process.exit(1);
}
const done = spawnSync(python, ['-X', 'utf8', 'speech/benchmark-speed.py', ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: { ...process.env, GAME_SPEECH_WAIT_MS: String(SPEECH_WAIT_MS), GAME_MAX_INPUT_MS: String(MAX_INPUT_MS) },
});
process.exit(done.status ?? 1);
