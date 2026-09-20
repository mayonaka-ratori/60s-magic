# このリポジトリで作業するときの案内

「はじまりの魔法：最初の24秒」の試作です。手で描いた線と声から魔法を作り、24秒で発動させます。全体の設計は [60秒魔法ゲーム 設計仕様](60秒魔法ゲーム_設計仕様.md)、文書の一覧は [docs/README.md](docs/README.md) にあります。

## 前提

- Node.js 22.12以上とChrome。
- Windowsで作っています。`setup:speech` と `scripts/*.ps1` はPowerShellが必要です。
- このPCでの音声認識にはNVIDIAのGPUが必要です。CPUだけで動かす設定は用意していません。
- JevとGoogleの接続情報がなくても、マウスと文字入力で一通り遊べます。

## コマンド

| コマンド | すること |
| --- | --- |
| `npm ci` | 依存するソフトの取得 |
| `npm run setup:assets` | 手の認識に使うファイルと画像の取得 |
| `npm run setup:speech` | このPCの音声認識の準備。初回は数GBの通信が必要 |
| `npm run dev` | 開発用に起動。http://localhost:5173 |
| `npm run build` | 型の検査と配布用の生成 |
| `npm start` | 配布用の画面で起動 |
| `npm test` | vitestの単体試験 |
| `npm run test:browser` | Playwrightのブラウザー試験 |
| `npm run test:speech` | 合成音声でこのPCの音声認識を確認 |
| `npm run test:chants` | 詠唱辞書の読み方と変換を確認 |

変更したら `npm test` と `npm run build` を通してください。ブラウザー試験は `npx playwright install chromium` の後に走ります。音声の試験は `setup:speech` を済ませたPCでのみ動きます。

## フォルダー

| 場所 | 中身 |
| --- | --- |
| `src/game/` | 時計、手の軌跡、発話の更新、魔法の決定 |
| `src/input/` | カメラとマイクの取り込み |
| `src/render/` | Babylon.jsの背景と騎士、画面手前の術式と魔法 |
| `src/audio/` | 効果音の合成と鳴らす時刻 |
| `server/` | 接続情報を持つサーバー、Jevの12問、音声認識の中継 |
| `speech/` | このPCの音声認識。使うソフトとモデルの版を固定 |
| `scripts/` | 準備と確認の補助。`.ps1` はWindows用 |
| `public/` | 画像、音声の処理、手の認識の作業用ファイル |
| `tests/` | 単体試験と `tests/browser/` のブラウザー試験 |
| `docs/` | 作った範囲と確認の記録 |

## 主な数値の置き場所

24秒の進行を変えるときは、ここを見れば足ります。

| 数値 | 場所 |
| --- | --- |
| 各場面の切り替わり時刻（6・11・14・17・23・24秒） | `src/game/session.ts` の `phaseAt` |
| Jevへ送る時刻と打ち切り（14.7秒、15.7秒） | `src/main.ts` と `src/game/session.ts` |
| サーバー側のJevの打ち切り（900ms） | `server/jev.ts` |
| 効果音の時刻と、録音中に鳴らさない境目（14.75秒） | `src/audio/cues.ts` |
| Jevへの12問の文面と選択肢 | `server/questions.ts` |
| 詠唱の110語 | `src/game/chant-dictionary.json` |
| 魔法の種類と個数の決め方 | `src/game/recipe.ts` |

## 文章の書き方

コード以外の文章はすべて日本語です。既存の文書と同じ調子に合わせてください。

- 平易な日本語で、日常の言葉だけを使います。比喩、詩的な言い回し、抽象的な言葉は使いません。
- 日本語の文の中に半角スペースを入れません。エムダッシュも使いません。
- 「〜することができます」ではなく「〜できます」のように、英語の直訳らしい言い方を避けます。
- 確認していないことを、確認したように書きません。「試験が通った」と「実際に人が使って確かめた」を分けて書きます。
- 新しい文書を足したら [docs/README.md](docs/README.md) の一覧にも行を足します。

## 気をつけること

- `.env` と認証ファイルはコミットしません。接続情報の値を文書やチャットに書かないでください。
- `.venv-speech`、`.local-speech`、`public/vision/` は大きいのでGitに含めません。`.gitignore` を確認してください。
- 声とカメラの映像はファイルに保存しません。この方針を変える変更は入れないでください。
- 音声認識の処理はこのPCの中で完結します。Googleへ切り替えるのは `SPEECH_PROVIDER=google` を設定した場合だけです。
