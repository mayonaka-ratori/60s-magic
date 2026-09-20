# はじまりの魔法：最初の40秒

「60秒魔法ゲーム」の試作です。手（またはマウス）で線を描き、声で唱えた言葉から魔法を作り、騎士へ放ちます。設計仕様の一回目（24秒）と防御の回（24〜40秒）を遊べます。とどめの魔法、魔導書、QR、展示の連続運転は次の段階です。

- 今どこまで確認できていて何が未確認か：[docs/実装と確認の記録.md](docs/実装と確認の記録.md)
- 文書の一覧と段階ごとの進み具合：[docs/README.md](docs/README.md)
- ゲーム全体の設計：[60秒魔法ゲーム_設計仕様.md](60秒魔法ゲーム_設計仕様.md)
- これから作る防御・とどめ・結果画面の設計：[docs/防御ととどめ_画面と流れの設計.md](docs/防御ととどめ_画面と流れの設計.md)
- 40秒の中で何がいつ起きるか、Jevと音声認識の細かい動き：[docs/動きの詳細.md](docs/動きの詳細.md)

## 起動する

Node.js 22.12以上、Chrome、Pythonの準備に使う [uv](https://docs.astral.sh/uv/getting-started/installation/) が必要です。WindowsとMacの両方で動きます。プロジェクトのフォルダーで実行してください。

```
npm ci
npm run setup:assets     # 手の認識に使うファイル
npm run setup:speech     # このPCの音声認識。初回は数GBの通信
npm run dev
```

[http://localhost:5173](http://localhost:5173) を開きます。「マウスで試す」を選び「魔法をつくる」を押すと遊べます。3秒の合図のあと40秒が始まります。押したまま動かすと線が残り、画面右側の欄に声の代わりの言葉を入れられます。

24秒からは防御の回です。画面の中ほどに赤い印が出るので、その印を囲むように描くと、囲った形がそのまま盾になります。囲えなくても、一番近い線が印の前へ動いて必ず防ぎます。詠唱で止め方が変わり、「弾き返せ」で敵の一撃が返り、「かき消せ」で消えます。

- 「手で描く」はカメラで手のひらの中央を追います。片手でも両手でも描けます。映像はこのPCの外へ送りません。
- 「マイクで唱える」は音声をこのPCの中で文字にします。Googleの契約やAPIキーは不要です。「氷よ、壁となれ」「雷よ、七つに分かれろ」などが試せます。
- 「効果音」はブラウザー内で合成します。`public/audio/` に素材を置くとその上に重なります。[音素材の入れ方](docs/音素材の入れ方.md)
- 開始画面の「詠唱の言葉を見る」で、辞書の110語と読み方を見られます。

URLに付けられる切り替えです。

| 付けるもの | 何が変わるか |
| --- | --- |
| `?dev=1` | 確認用の表示とボタン（記録を見る・保存する、接続の確認など）を出す。遊ぶ人には出さない |
| `?view=look` | 背景・騎士・完成した術式だけを見る画面。[説明](docs/見た目の確認画面.md) |
| `?view=effects` | 演出の派手さを見比べる画面。[説明](docs/演出のバリエーション_実装.md) |
| `?calm=1` `?composite=0` `?scale=2` | 控えめモード、合成と後処理を切る、後処理の解像度を落とす。[提案と進み具合](docs/大型バトル演出_全面更新の提案.md) |
| `?preset=calm` `vivid` `max` | 本編の派手さ。指定がなければ派手な設定 |
| `?hands=cpu` | 手の認識をわざとCPUで動かす（普段はGPUを試し、だめならCPUへ戻る） |

配布用の画面は `npm run build` のあと `npm start` で起動します。初期設定では自分のPCからだけ開けます。

## 試験する

| コマンド | すること | かかる時間 |
| --- | --- | --- |
| `npm test` | 単体の試験（235件） | 数秒 |
| `npm run build` | 型の検査と配布用の生成 | 数秒 |
| `npm run test:speech` | 合成音声でこのPCの音声認識を確認。4種類×3回。結果は `.local-speech/test-report.json` | 1分 |
| `node scripts/prepare-browser-audio.mjs` | 上の音から、ブラウザー試験用の音を作る | 数秒 |
| `npm run test:browser` | ブラウザーの試験（16件）。うち1件が実際の音声認識を使い、上の音がなければ飛ばす | 15分 |
| `npm run test:chants` | 詠唱辞書の読み方と変換を確認 | 数秒 |
| `npm run benchmark:speech` | 認識モデルの速さを比べる（先に `npm run make:speech-fixtures`） | 数分 |

ブラウザー試験は最初に `npx playwright install chromium` が要ります。Macで走らせるときは `npm run dev` を止めてからにしてください。カメラの試験はブラウザーが作った映像を使うので、実際の手の精度を示すものではありません。

## 設定（`.env`）

PC内の音声認識だけなら `.env` は不要です。JevやGoogleを使うときだけ `.env.example` をコピーして値を入れ、起動し直します。秘密の値はコードやチャットに貼らないでください。

| 値 | 意味 |
| --- | --- |
| `JEV_API_KEY` `JEV_MODEL` | Jevの接続情報。未設定なら魔法の内容はPC内の規則で決める |
| `SPEECH_PROVIDER` | `local`（初期値）、`google`、`off` |
| `LOCAL_SPEECH_MODEL_ID` | 認識モデル。空欄なら Apple SiliconのMacは `kotoba-v2.0-mlx`、WindowsとNVIDIAのGPUは `kotoba-v2.0`、それ以外は `small`。変えたら `setup:speech` をやり直す |
| `LOCAL_SPEECH_ENGINE` `LOCAL_SPEECH_DEVICE` `LOCAL_SPEECH_THREADS` | 普段は空欄。動かし方やGPU/CPUを強制したいときだけ |
| `GOOGLE_CLOUD_PROJECT` ほか | Googleへ切り替えるときだけ |

## フォルダー

| 場所 | 中身 |
| --- | --- |
| `src/game/` | 回ごとの時刻、戦いの進行役、手の軌跡、発話の更新、魔法の決定、盾の決定、詠唱辞書、確認用の記録 |
| `src/input/` | カメラとマイクの取り込み。`public/hand-worker.js` と `public/audio-worklet.js` も使う |
| `src/render/` | Babylon.jsの背景と騎士、画面手前の術式と魔法 |
| `src/audio/` | 効果音の合成と鳴らす時刻 |
| `server/` | 接続情報を持つサーバー、Jevの12問、音声認識の中継 |
| `speech/` | このPCの音声認識（Kotoba-Whisper）。PCに合わせて faster-whisper か mlx-whisper を選ぶ |
| `scripts/` | 準備と確認の補助 |
| `public/` | 画像、音声の処理、手の認識の作業用ファイル |
| `tests/` | 単体の試験と `tests/browser/` のブラウザー試験 |
| `docs/` | 作った範囲と確認の記録 |

## 主な数値の置き場所

40秒の進行を変えるときは、ここを見れば足ります。

| 数値 | 場所 |
| --- | --- |
| 回ごとの場面の時刻（一回目0〜24秒、防御24〜40秒）。騎士と体力の時刻もこの表から作る | `src/game/rounds.ts` の `ROUNDS` |
| 最後の声を待つ時間（1.4秒）、待ちの打ち切り、Jevの打ち切り、確定 | `src/game/rounds.ts` の先頭 |
| 狙いの印の位置と大きさ、囲みの判定、盾の作り方、止め方の言葉 | `src/game/guard.ts` |
| 敵の一撃と盾の見た目 | `src/render/effects/guard.ts` |
| 騎士の8つの姿勢と、角が折れる・胸当てが外れる時刻 | `src/render/knight.ts` |
| 終了直前に途中の認識を始めない境目（12.6秒） | `server/local-speech-session.ts` |
| サーバー側のJevの打ち切り（900ms） | `server/jev.ts` |
| 効果音の時刻と、録音中に鳴らさない境目 | `src/audio/cues.ts` |
| Jevへの12問の文面と選択肢 | `server/questions.ts` |
| 詠唱の110語と、音声認識へ渡す14語の手掛かり | `src/game/chant-dictionary.json` |
| 属性の言葉（「かみなり」の聞き違いも含む）と魔法の種類・個数の決め方 | `src/game/recipe.ts` |
| 手の認識のしきい値と、筆を分ける条件（350ms） | `public/hand-worker.js`、`src/game/motion.ts` |

## 実装時に確認した公式資料

- [Jevの通信形式](https://docs.typesafe.ai/api)、[候補の回答](https://docs.typesafe.ai/primitives/choice)
- [MediaPipeのブラウザー向け手の認識](https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker/web_js)
- [Kotoba-Whisper v2.0](https://huggingface.co/kotoba-tech/kotoba-whisper-v2.0-faster)、[faster-whisper](https://github.com/SYSTRAN/faster-whisper)
- [Google Chirp 3](https://docs.cloud.google.com/speech-to-text/docs/models/chirp-3)
