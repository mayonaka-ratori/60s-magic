/**
 * 90秒の通しで鳴るはずの音の並び。実装から作らず、ここに直接書く。
 * 一回目、防御、とどめの順。とどめの並びは tests/finish-audio.test.ts と同じ。
 * 魔導書の音（book）は、魔導書の枠が浮かび始める89.4秒に戦いの中で鳴るので、とどめの最後に入る。
 * 二つの通し（knight-audio、sample-audio）が同じ並びを見るので、写しを作らずここから読む。
 */
export const 鳴る音=[
  // 一回目（0〜30秒）
  'trace','chant','build','complete','release','impact','settle',
  // 防御（30〜56秒）。命中ではなく、盾で受ける音になる。
  'chant','build','complete','release','block','settle',
  // とどめ（56〜90秒）
  'chant','build','complete','release','impact','finish',
  'collapse-sword','collapse-knee','collapse-fall','settle','book',
];
