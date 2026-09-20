// 確認用の日本語音声をこのPCの中で作る。実際の人の声とは分けて記録する。
// Windows は System.Speech、Mac は say を使う。どちらも通信しない。
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const casesFile = process.argv[2] || 'tests/fixtures/chant-audio.json';

if (process.platform === 'win32') {
  const done = spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass',
    '-File', 'scripts/make-speech-fixtures.ps1', casesFile], { stdio: 'inherit' });
  process.exit(done.status ?? 1);
}
if (process.platform !== 'darwin') {
  console.error('確認用の音声を作れるのは Windows と Mac です。');
  process.exit(1);
}

const voices = spawnSync('say', ['-v', '?'], { encoding: 'utf8' }).stdout || '';
const japanese = voices.split('\n').find(line => /\bja_JP\b/.test(line));
if (!japanese) {
  console.error('日本語の読み上げの声が見つかりません。');
  console.error('システム設定 → アクセシビリティ → 読み上げ → システムの声 で日本語の声（Kyokoなど）を追加してください。');
  process.exit(1);
}
const voice = japanese.split(/\s{2,}|\s(?=[a-z]{2}_)/)[0].trim();

const out = resolve('.local-speech/test-audio');
mkdirSync(out, { recursive: true });
const cases = JSON.parse(readFileSync(resolve(casesFile), 'utf8'));
for (const item of cases) {
  // 16kHz・一チャンネル・16bit。ゲームがマイクから作る形と同じにする。
  const done = spawnSync('say', ['-v', voice, '--data-format=LEI16@16000', '--file-format=WAVE',
    '-o', resolve(out, `${item.id}.wav`), '--', item.text], { stdio: 'inherit' });
  if (done.status !== 0) {
    console.error(`音声を作れませんでした: ${item.id}`);
    process.exit(1);
  }
}
writeFileSync(resolve(out, 'cases.json'), JSON.stringify(cases, null, 2), 'utf8');
console.log(`確認用の日本語音声をPC内で作りました（声: ${voice}）。実際の人の声とは分けて記録します。`);
