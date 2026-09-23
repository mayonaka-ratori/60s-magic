# はじまりの魔法：90秒

「90秒魔法ゲーム」の試作です。標準の「順番に」は、一回目に声で唱え、防御は手で描き、とどめは描いてから唱えます。「同時に」を選ぶと、三回とも描きながら唱えられます。どちらも90秒で魔導書（結果画面）が出ます。QRの先の公開ページと、展示の連続運転はこれからです。

- 今どこまで確認できていて何が未確認か：[docs/実装と確認の記録.md](docs/実装と確認の記録.md)
- 文書の一覧と段階ごとの進み具合：[docs/README.md](docs/README.md)
- ゲーム全体の設計：[90秒魔法ゲーム_設計仕様.md](90秒魔法ゲーム_設計仕様.md)
- 防御・とどめ・結果画面の設計：[docs/防御ととどめ_画面と流れの設計.md](docs/防御ととどめ_画面と流れの設計.md)
- 90秒の中で何がいつ起きるか、Jevと音声認識の細かい動き：[docs/動きの詳細.md](docs/動きの詳細.md)
- 確認用の記録（JSON）の見方：[docs/確認用の記録の見方.md](docs/確認用の記録の見方.md)

## 起動する

Node.js 22.12以上、Chrome、Pythonの準備に使う [uv](https://docs.astral.sh/uv/getting-started/installation/) が必要です。WindowsとMacの両方で動きます。プロジェクトのフォルダーで実行してください。

```
npm ci
npm run setup:assets     # 手の認識に使うファイル
npm run setup:speech     # このPCの音声認識。初回は数GBの通信
npm run dev
```

[http://localhost:5173](http://localhost:5173)を開きます。声を使うときは口元のマイクが付いたヘッドセットを使ってください。「手で描く」または「マウスで試す」を選び、「魔法をつくる」を押します。3秒の合図のあと90秒が始まります。時刻は下の表のとおりで、秒ごとの流れは[動きの詳細](docs/動きの詳細.md)にあります。

| 遊び方 | 一回目 | 防御 | とどめ |
| --- | --- | --- | --- |
| 順番に（標準） | 0〜26秒。14秒まで声だけ | 26〜50秒。38秒まで手だけ | 50〜90秒。62秒まで描き、合図のあと72秒まで唱える |
| 同時に | 0〜30秒。18秒まで描いて唱える | 30〜56秒。45秒まで描いて唱える | 56〜90秒。72秒まで描いて唱える |

「順番に」では、言葉が届くたびに円の色や形、動きが増えます。「壁」「球」「螺旋」「追尾」「七つ」「守れ」「顕現」などで見え方が変わります。同じ言葉を繰り返しても部品は増えません。言い直すと前の部品は薄くなります。声の大きさは使いません。

防御では、左に浮かぶ赤い輪のまわりに描きます。「順番に」は、囲うと弾き返し、線が輪に掛かると受け止め、離れているとかき消します。盾は属性を持ちません。「同時に」は「弾き返せ」「かき消せ」などの言葉で止め方を選びます。線がなくても必ず防ぎます。

声を使わずに試すときは「マイクで唱える」を外します。「同時に」へ読み込み直し、画面右側の欄に声の代わりの言葉を入れられます。「見本の動きを見る」は、選んだ遊び方を機器なしで再生します。開始画面のまま誰も触らないと、見本は30秒で自動で始まります。

90秒で三つの魔法名、術式、確認番号が魔導書に並びます。遊び方の名前、描いた線、詠唱の文字はこのPCのブラウザーの中だけに残ります。カメラの映像と声そのものは残しません。持ち帰りのQRはまだ無いので、「持ち帰りの準備中」と出ます。

- 「手で描く」はカメラで手のひらの中央を追います。片手でも両手でも描けます。映像はこのPCの外へ送りません。
- 「マイクで唱える」は音声をこのPCの中で文字にします。Googleの契約やAPIキーは不要です。「氷よ、壁となれ」「雷よ、七つに分かれろ」などが試せます。
- 「効果音」は録音中も鳴ります。声を受け付ける間だけ、曲と効果音を8dB下げます。音はブラウザー内で合成します。`public/audio/` に素材を置くとその上に重なります。[音素材の入れ方](docs/音素材の入れ方.md)
- 開始画面の「詠唱の言葉を見る」で、辞書の110語と読み方を見られます。

URLに付けられる切り替えです。

| 付けるもの | 何が変わるか |
| --- | --- |
| `?flow=sequential` `?flow=together` | 「順番に」「同時に」。指定なしは「順番に」。開始画面で選び直すとページを読み込み直す |
| `?dev=1` | 確認用の表示とボタン（記録を見る・保存する、接続の確認など）を出す。遊ぶ人には出さない |
| `?view=look` | 背景・騎士・完成した術式だけを見る画面。[説明](docs/見た目の確認画面.md) |
| `?view=effects` | 演出の派手さを見比べる画面。[説明](docs/演出のバリエーション_実装.md) |
| `?calm=1` `?calm=0` `?composite=0` `?scale=2` | 控えめで始める、派手で始める、合成と後処理を切る、後処理の解像度を落とす。控えめかどうかは画面のボタンでいつでも変えられる。[提案と進み具合](docs/大型バトル演出_全面更新の提案.md) |
| `?bloom=1` | 速さが落ちてもブルーム（光のにじみ）を切らずに出し続ける。見え方の確認用 |
| `?composite=always` | 合成を0秒から見せる。既定では一回目の確定の0.5秒後から合成に切り替わるので、その差を見比べる用 |
| `?preset=calm` `vivid` `max` | 本編の派手さ。指定がなければ派手な設定 |
| `?hands=cpu` | 手の認識をわざとCPUで動かす（普段はGPUを試し、だめならCPUへ戻る） |
| `?attract=30` `?resultIdle=180` | 開始画面で誰も触らないとき見本を流すまでの秒数（初期値30秒）と、結果画面から開始画面へ戻るまでの秒数（初期値180秒）。5秒から600秒の間で指定する |

配布用の画面は `npm run build` のあと `npm start` で起動します。初期設定では自分のPCからだけ開けます（`.env` の `HOST` が `127.0.0.1` のため）。

## 試験する

| コマンド | すること | かかる時間 |
| --- | --- | --- |
| `npm test` | 単体の試験。同じ試験を「同時に」と「順番に」の二つの表で走らせる（「同時に」の秒数を前提にした8ファイルは「同時に」だけ）。全部通ること（件数は[実装と確認の記録](docs/実装と確認の記録.md)） | 10秒ほど |
| `npm run build` | 型の検査と配布用の生成 | 10〜20秒 |
| `npm run test:speech` | 合成音声を作り、このPCの音声認識を確認する。4種類×3回と無音。結果は `.local-speech/test-report.json`。合成音声を作れるのはMacとWindowsだけ | 1分ほど |
| `node scripts/prepare-browser-audio.mjs` | 上の音から、ブラウザー試験用の音を作る | 数秒 |
| `npm run test:browser` | ブラウザーの試験（21件）。両方の遊び方の通しと、途中で中止して記録を読む確認。うち1件が「同時に」で実際の音声認識を使い、上の音がなければ飛ばす | Windowsで15件を走らせたときは約7.5分（2026年9月23日）。今の21件はMacでまだ走らせておらず、時間も未計測 |
| `npx tsx scripts/capture-90s.mjs --flow=sequential` | 仮の時計で90秒を進めながら画面写真を撮る確認。先に `npm run dev` を起動しておく。写真は `test-results/capture/sequential/` に出る。「同時に」は `--flow=together` | 数分 |
| `npx tsx scripts/capture-guide.mjs --flow=sequential` | 解説ページに載せる15枚を撮り直す。先に `npm run dev` を起動しておく。写真は `test-results/guide/sequential/` に出る。「同時に」は `--flow=together`。「順番に」は見本を撮るため、音声認識の確認には使わない | 数分 |
| `npm run test:chants` | 合成音声を認識させ、詠唱辞書の読み方と変換を確認（先に `setup:speech`） | 数分 |
| `npm run benchmark:speech` | 認識モデルの速さを比べる（先に `npm run make:speech-fixtures`）。[確認に使うPC](docs/確認に使うPC.md) | 数分 |
| `npm run audio:check` | `public/audio/` に置いた音素材がそろっているかを一覧にする | 数秒 |

ブラウザー試験は最初に `npx playwright install chromium` が要ります。Macで走らせるときは `npm run dev` を止めてからにしてください。カメラの試験はブラウザーが作った映像を使うので、実際の手の精度を示すものではありません。

## 設定（`.env`）

PC内の音声認識だけなら `.env` は不要です。JevやGoogleを使うときだけ `.env.example` をコピーして値を入れ、起動し直します。秘密の値はコードやチャットに貼らないでください。

| 値 | 意味 |
| --- | --- |
| `PORT` `HOST` | 開く番号と、受け付ける相手。初期値は `5173` と `127.0.0.1`（このPCからだけ） |
| `JEV_API_KEY` `JEV_MODEL` | Jevの接続情報。未設定なら魔法の内容はPC内の規則で決める |
| `SPEECH_PROVIDER` | `local`（初期値）、`google`、`off` |
| `LOCAL_SPEECH_MODEL_ID` | 認識モデル。空欄なら Apple SiliconのMacは `kotoba-v2.0-mlx`、Windowsは `kotoba-v2.0`、それ以外は `small`。変えたら `setup:speech` をやり直す |
| `LOCAL_SPEECH_ENGINE` `LOCAL_SPEECH_DEVICE` `LOCAL_SPEECH_THREADS` | 普段は `auto` か空欄。動かし方やGPU/CPU、CPUの数を決めたいときだけ |
| `LOCAL_SPEECH_HINTS` | 辞書の14語を認識の手掛かりとして渡すか。`auto` ならMacのGPUでは渡さない。渡すと悪くなるため |
| `LOCAL_SPEECH_PYTHON` `LOCAL_SPEECH_MODEL` | 認識に使うPythonと、モデルのフォルダー。普段は空欄（`setup:speech` が作った場所を使う） |
| `GOOGLE_CLOUD_PROJECT` ほか | Googleへ切り替えるときだけ |

## フォルダー

| 場所 | 中身 |
| --- | --- |
| `src/`（直下） | 遊ぶ画面の進行（`main.ts`）、`?view=` の振り分け（`entry.ts`）、見た目の確認画面と見比べ画面 |
| `src/game/` | 二つの遊び方の時刻、戦いの進行役、手の軌跡、発話の更新、声の部品、入力の量、魔法の決定、盾の決定、詠唱辞書、遊んだ記録の保存、確認用の記録 |
| `src/input/` | カメラとマイクの取り込み。`public/hand-worker.js` と `public/audio-worklet.js` も使う |
| `src/render/` | Babylon.jsの背景と騎士、画面手前の術式と魔法 |
| `src/audio/` | 効果音の合成と鳴らす時刻 |
| `server/` | 接続情報を持つサーバー、Jevの12問、このPCの音声認識とGoogleの中継 |
| `speech/` | このPCの音声認識（Kotoba-Whisper）。PCに合わせて faster-whisper か mlx-whisper を選ぶ |
| `scripts/` | 準備と確認の補助 |
| `public/` | 背景などの画像、音素材の置き場、音声の処理、手の認識の作業用ファイル。`public/vision/` は `setup:assets` が作り、Gitには含めない |
| `tests/` | 単体の試験、`tests/browser/` のブラウザー試験、`tests/fixtures/` の試験用の文例と、認識モデルだけを置き換えた音声の受付処理 |
| `docs/` | 設計、作った範囲、確認の記録。一覧は [docs/README.md](docs/README.md) |

## 主な数値の置き場所

90秒の進行を変えるときは、ここを見れば足ります。

| 数値 | 場所 |
| --- | --- |
| 二つの遊び方の回ごとの時刻（受付の開始、描く締め切り、声の受付開始、締め切り、確定、発動、命中、終わり）。騎士、体力、音の時刻も選んだ表から作る | `src/game/rounds.ts` の `SEQUENTIAL_ROUNDS` と `TOGETHER_ROUNDS` |
| 最後の声を待つ時間、Jevの返事を受け取れる期限、声の受付をつなぎ直す早さ、回の始まりの合図の長さ | `src/game/rounds.ts` の `SPEECH_WAIT_MS`、`replyLimitOf`、`VOICE_RECONNECT_MS`、`ANNOUNCEMENT_MS`、`TOGETHER_ANNOUNCEMENT_MS` |
| 防御でよろめく時刻、とどめの多段命中、とどめの一撃、崩れ落ちの時刻 | `src/game/rounds.ts` の `GUARD_STAGGER_MS`、`FINISH_HIT_OFFSETS_MS`、`FINISH_` で始まる値 |
| 狙いの印の位置と大きさ、囲みの判定、盾の作り方、止め方の言葉 | `src/game/guard.ts` |
| 敵の一撃と盾の見た目、床の亀裂と塵 | `src/render/effects/guard.ts` |
| 完成した術式を置ける範囲と、小さく描いたときに広げる下限 | `src/render/spell-layout.ts` の `SPELL_BOUNDS` と `SPELL_MIN` |
| 弾が画面の端へ膨らむ大きさ、光線の口の幅 | `src/render/effects/release.ts` の `SWELL` と `BEAM_MOUTH` |
| 命中で止める長さと三段の時刻、とどめの止めとスロー、寄り、傾き、敵の圧の揺れ | `src/render/effects/screen.ts` の先頭 |
| 騎士が自分から動く時刻（足踏み、盾打ち、溜め、床の一撃） | `src/game/rounds.ts` の `ENEMY_MOVES` ほか |
| 騎士の10の姿勢と、とどめで部品が落ちる順 | `src/render/knight.ts` |
| 終了直前に途中の認識を始めない決まり（境目は受付の終わりから `SPEECH_WAIT_MS` だけ前） | `server/local-speech-session.ts` |
| サーバー側のJevの打ち切り（900ms） | `server/jev.ts` |
| 効果音の時刻と、声の受付中だけ音量を下げる範囲。下げる量（8dB）は `src/audio/cast-audio.ts` | `src/audio/cues.ts` |
| Jevへの12問の文面と選択肢 | `server/questions.ts` |
| 詠唱の110語と、音声認識へ渡す14語の手掛かり | `src/game/chant-dictionary.json` |
| 属性の言葉（「かみなり」の聞き違いも含む）と魔法の種類・個数の決め方 | `src/game/recipe.ts` |
| 手の認識のしきい値と、筆を分ける条件（350ms） | `public/hand-worker.js`、`src/game/motion.ts` |
| 声の部品の保存と描画、次の回へ渡す色 | `src/game/voice-growth.ts`、`src/render/effects/voice-growth.ts` |
| 確認番号の作り方、このPCの中への保存、保存の状態の文言、結果に並べる三件 | `src/game/record.ts` |

## 実装時に確認した公式資料

- [Jevの通信形式](https://docs.typesafe.ai/api)、[候補の回答](https://docs.typesafe.ai/primitives/choice)
- [MediaPipeのブラウザー向け手の認識](https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker/web_js)
- [Kotoba-Whisper v2.0](https://huggingface.co/kotoba-tech/kotoba-whisper-v2.0-faster)、[faster-whisper](https://github.com/SYSTRAN/faster-whisper)
- [Google Chirp 3](https://docs.cloud.google.com/speech-to-text/docs/models/chirp-3)
