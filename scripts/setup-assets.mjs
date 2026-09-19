import { mkdir, cp, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

await mkdir('public/vision', { recursive: true });
await cp('node_modules/@mediapipe/tasks-vision/wasm', 'public/vision/wasm', { recursive: true });
await cp('node_modules/@mediapipe/tasks-vision/vision_bundle.cjs', 'public/vision/vision_bundle.js');
const path = 'public/vision/hand_landmarker.task';
let bytes;
try { bytes = await readFile(path); } catch {
  const response = await fetch('https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task');
  if (!response.ok) throw new Error(`手の認識モデルを取得できませんでした: ${response.status}`);
  bytes = Buffer.from(await response.arrayBuffer());
  await writeFile(path, bytes);
}
const sha256 = createHash('sha256').update(bytes).digest('hex');
await writeFile('public/vision/version.json', JSON.stringify({ mediapipe: '0.10.32', model: 'float16/1', sha256 }, null, 2));
console.log('手の認識に使うファイルをPCへ保存しました。', sha256);
