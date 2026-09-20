// OSに合わせて音声認識の準備手順を選ぶ。.env の LOCAL_SPEECH_MODEL_ID があれば、そのモデルを取得する。
import 'dotenv/config';
import { spawnSync } from 'node:child_process';

console.log(`取得する認識モデル: ${process.env.LOCAL_SPEECH_MODEL_ID || (process.platform === 'darwin' ? 'small（Mac向けの初期値）' : 'kotoba-v2.0')}`);

const result = process.platform === 'win32'
  ? spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', 'scripts/setup-speech.ps1'], { stdio: 'inherit' })
  : spawnSync('bash', ['scripts/setup-speech.sh'], { stdio: 'inherit' });
if (result.error) {
  console.error('準備の手順を起動できませんでした:', result.error.message);
  process.exit(1);
}
process.exit(result.status ?? 1);
