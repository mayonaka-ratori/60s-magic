import { readFile, writeFile } from 'node:fs/promises';

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
// マイクは開始ボタンの直後に開き、そのあと音声認識のつなぎ込み（約0.4秒）と3秒の合図を経て、一回目の受付（18秒）が始まる。
// 受付の17.3秒ごろ、つまり締め切りの0.7秒前に声が終わるように、そのぶん後ろへ置く。
// 締め切りまで声を拾い続けられるかを、ブラウザーの試験でそのまま確かめるための置き方。
// 数字の出どころ：3000は src/game/rounds.ts の COUNTDOWN_MS、18000は同じ表の ROUNDS[0].inputEnd。
// このファイルは .mjs なので rounds.ts を読み込めない。表の秒数を変えたら、ここも直すこと。
const LEAD_MS=3400,END_MS=17300;
for (const [name,voice] of [['ice',ice],['seven',seven]]) {
  const audio=Buffer.alloc(32000*30);
  const startMs=LEAD_MS+END_MS-voice.length/32;
  voice.copy(audio,Math.round(startMs*32));
  await writeFile(`.local-speech/test-audio/browser-${name}.wav`,wave(audio));
  console.log(`${name}: 音の先頭から${startMs.toFixed(0)}〜${LEAD_MS+END_MS}ms に合成した声を配置（一回目の受付の中では約${END_MS-voice.length/32|0}〜${END_MS}ms）`);
}
