// OSに合わせて音声認識の準備手順を選ぶ。
import { spawnSync } from 'node:child_process';

const result = process.platform === 'win32'
  ? spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', 'scripts/setup-speech.ps1'], { stdio: 'inherit' })
  : spawnSync('bash', ['scripts/setup-speech.sh'], { stdio: 'inherit' });
if (result.error) {
  console.error('準備の手順を起動できませんでした:', result.error.message);
  process.exit(1);
}
process.exit(result.status ?? 1);
