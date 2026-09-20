import { readFile, stat } from 'node:fs/promises';

const manifest = JSON.parse(await readFile('public/audio/manifest.json', 'utf8'));
const files = new Map();
if (manifest.bgm?.file) files.set(manifest.bgm.file, '曲');
for (const [name, entry] of Object.entries(manifest.sfx ?? {})) {
  for (const file of entry.files ?? (entry.file ? [entry.file] : [])) files.set(file, (files.get(file) ? files.get(file) + '、' : '') + name);
}
let missing = 0;
for (const [file, use] of files) {
  let size = null;
  try { size = (await stat('public/audio/' + file)).size; } catch { /* 無い */ }
  if (size === null) missing++;
  console.log(`${size === null ? '無い' : 'ある'}  ${file.padEnd(28)} ${size === null ? '' : (size / 1024).toFixed(0) + 'KB'}  ${use}`);
}
console.log(missing ? `\n${missing}件が見つかりません。無い項目は合成音だけで鳴ります。置き方は docs/音素材の入れ方.md を見てください。` : '\nすべて揃っています。');
