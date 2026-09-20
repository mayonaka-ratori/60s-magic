// 準備できている認識モデルの速さを測る。引数でモデル名を選べる。
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const python = resolve(process.platform === 'win32' ? '.venv-speech/Scripts/python.exe' : '.venv-speech/bin/python');
if (!existsSync(python)) {
  console.error('先に npm run setup:speech で音声認識を準備してください。');
  process.exit(1);
}
const done = spawnSync(python, ['-X', 'utf8', 'speech/benchmark-speed.py', ...process.argv.slice(2)], { stdio: 'inherit' });
process.exit(done.status ?? 1);
