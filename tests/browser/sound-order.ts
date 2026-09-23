/**
 * 90秒の通しで鳴るはずの音の並び。実装から作らず、ここに直接書く。
 * 一回目、防御、とどめの順。とどめの並びは tests/finish-audio.test.ts と同じ。
 * 魔導書の音（book）は、魔導書の枠が浮かび始める回の終わりの少し前に戦いの中で鳴るので、とどめの最後に入る。
 * 90秒を通す knight-audio と sequential は「順番に」の全部の並びを、防御の回に入ったところで中止する sample-audio は「順番に」の一回目の並びを見る。
 * 単体の試験（tests/flow-audio.test.ts）は、二つの遊び方の両方の並びを見る。写しを作らずここから読む。
 */
/** 同時に。一回目は、騎士の足踏み（step）と盾打ち（clang）も受付中に鳴る。 */
export const 一回目に鳴る音=['step','trace','clang','chant','build','complete','release','impact','settle'];
export const 鳴る音=[
  ...一回目に鳴る音,
  // 防御。命中ではなく、盾で受ける音になる。確定と同時に剣の風切り、そのすぐ後に床を打つ。
  'chant','build','complete','swing','slam','release','block','settle',
  // とどめ
  'chant','build','complete','release','impact','finish',
  'collapse-sword','collapse-knee','collapse-fall','settle','book',
];

/**
 * 順番に。一回目は声だけ、防御は手だけ、とどめは手のあと声。
 * 声だけの一回目と手だけの防御には、詠唱の案内の音（chant）が無い。線の合図（trace）は防御ととどめの始まりに鳴る。
 */
export const 順番に一回目に鳴る音=['step','clang','build','complete','release','impact','settle'];
export const 順番に鳴る音=[
  ...順番に一回目に鳴る音,
  'trace','build','complete','swing','slam','release','block','settle',
  // とどめは、描く締め切りで詠唱の案内が鳴る。
  'trace','chant','build','complete','release','impact','finish',
  'collapse-sword','collapse-knee','collapse-fall','settle','book',
];
