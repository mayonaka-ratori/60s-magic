const soundCues=[
  {name:'trace',at:6000},{name:'chant',at:11000},{name:'build',at:14750},
  {name:'complete',at:16000},{name:'release',at:17000},{name:'impact',at:18500},{name:'settle',at:22000},
] as const;
export type SoundCue=typeof soundCues[number]['name'];
export function dueSounds(previous:number,now:number,microphone:boolean) {
  // 録音終了と最後の文字を待つ間は鳴らさない。遅れた音をまとめて鳴らさない。
  return soundCues.filter(cue=>cue.at>previous&&cue.at<=now&&now-cue.at<300&&(!microphone||cue.at>=14750));
}
