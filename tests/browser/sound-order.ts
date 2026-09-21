/**
 * 90秒の通しで鳴るはずの音の並び。実装から作らず、ここに直接書く。
 * 一回目、防御、とどめの順。とどめの並びは tests/finish-audio.test.ts と同じ。
 * 魔導書の音（book）は、魔導書の枠が浮かび始める89.4秒に戦いの中で鳴るので、とどめの最後に入る。
 * 二つの通し（knight-audio、sample-audio）が同じ並びを見るので、写しを作らずここから読む。
 */
export const 鳴る音=[
  // 一回目（0〜30秒）。マウスで遊ぶので、騎士の足踏み（3.5秒）と盾打ち（9.5秒）も鳴る。
  'step','trace','clang','chant','build','complete','release','impact','settle',
  // 防御（30〜56秒）。命中ではなく、盾で受ける音になる。48秒の完成と同時に剣の風切り、0.55秒後に床を打つ。
  'chant','build','complete','swing','slam','release','block','settle',
  // とどめ（56〜90秒）
  'chant','build','complete','release','impact','finish',
  'collapse-sword','collapse-knee','collapse-fall','settle','book',
];
