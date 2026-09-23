import { readFile, writeFile } from 'node:fs/promises';
import { COUNTDOWN_MS, TOGETHER_ROUNDS, windowMsOf } from '../src/game/rounds.ts';

function pcm(wav) {
  for (let at=12;at+8<=wav.length;) {
    const size=wav.readUInt32LE(at+4);
    if(wav.toString('ascii',at,at+4)==='data')return wav.subarray(at+8,at+8+size);
    at+=8+size+(size%2);
  }
  throw new Error('音声がありません');
}
function wave(audio) {
  const header=Buffer.alloc(44);
  header.write('RIFF');header.writeUInt32LE(36+audio.length,4);header.write('WAVEfmt ',8);
  header.writeUInt32LE(16,16);header.writeUInt16LE(1,20);header.writeUInt16LE(1,22);
  header.writeUInt32LE(16000,24);header.writeUInt32LE(32000,28);header.writeUInt16LE(2,32);header.writeUInt16LE(16,34);
  header.write('data',36);header.writeUInt32LE(audio.length,40);
  return Buffer.concat([header,audio]);
}
const ice=pcm(await readFile('.local-speech/test-audio/ice.wav'));
const seven=pcm(await readFile('.local-speech/test-audio/seven.wav'));
// マイクは開始ボタンの直後に開き、そのあと音声認識のつなぎ込み（約0.4秒）と準備の合図（COUNTDOWN_MS）を経て、一回目の受付が始まる。
// 受付の締め切りの0.7秒前に声が終わるように、そのぶん後ろへ置く。
// 締め切りまで声を拾い続けられるかを、ブラウザーの試験（tests/browser/local-voice.spec.ts）でそのまま確かめるための置き方。
// その試験は「同時に」で遊ぶので、一回目の受付の長さは TOGETHER_ROUNDS の一行目から作る。
const CONNECT_MS=400,END_BEFORE_MS=700;
const LEAD_MS=COUNTDOWN_MS+CONNECT_MS,END_MS=windowMsOf(TOGETHER_ROUNDS[0])-END_BEFORE_MS;
for (const [name,voice] of [['ice',ice],['seven',seven]]) {
  const audio=Buffer.alloc(32000*30);
  const startMs=LEAD_MS+END_MS-voice.length/32;
  voice.copy(audio,Math.round(startMs*32));
  await writeFile(`.local-speech/test-audio/browser-${name}.wav`,wave(audio));
  console.log(`${name}: 音の先頭から${startMs.toFixed(0)}〜${LEAD_MS+END_MS}ms に合成した声を配置（一回目の受付の中では約${END_MS-voice.length/32|0}〜${END_MS}ms）`);
}
