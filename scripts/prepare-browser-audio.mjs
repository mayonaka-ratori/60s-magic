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
// カメラとマイクの準備後にも無音を残し、最後の数秒で発話する。
for (const [name,voice] of [['ice',ice],['seven',seven]]) {
  const audio=Buffer.alloc(32000*30);
  const startMs=13500-voice.length/32;
  voice.copy(audio,Math.round(startMs*32));
  await writeFile(`.local-speech/test-audio/browser-${name}.wav`,wave(audio));
  console.log(`${name}: ${startMs.toFixed(0)}〜13500ms に合成した声を配置`);
}
