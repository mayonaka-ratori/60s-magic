#!/usr/bin/env bash
# Mac と Linux 向け。Windows は scripts/setup-speech.ps1 を使う。
set -euo pipefail
cd "$(dirname "$0")/.."
if ! command -v uv >/dev/null 2>&1; then
  echo 'uv が必要です。https://docs.astral.sh/uv/getting-started/installation/ の手順で入れてください。' >&2
  exit 1
fi
python=.venv-speech/bin/python
if [ ! -x "$python" ]; then
  uv venv --python 3.12 .venv-speech
fi
uv pip sync speech/requirements.lock --python "$python"
"$python" -X utf8 speech/download_model.py
"$python" -X utf8 speech/worker.py --check
echo 'このPCで音声認識を使えます。npm run dev で起動してください。'
