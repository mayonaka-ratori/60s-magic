$ErrorActionPreference = 'Stop'
$speechRoot = Split-Path -Parent $PSScriptRoot
Push-Location -LiteralPath $speechRoot
try {
    if (-not (Get-Command uv -ErrorAction SilentlyContinue)) {
        throw 'uv が必要です。https://docs.astral.sh/uv/getting-started/installation/ の手順で入れてください。'
    }
    $speechPython = Join-Path $speechRoot '.venv-speech/Scripts/python.exe'
    if (-not (Test-Path -LiteralPath $speechPython)) {
        & uv venv --python 3.12 .venv-speech
        if ($LASTEXITCODE -ne 0) { throw 'Python の準備に失敗しました。' }
    }
    & uv pip sync speech/requirements.lock --python $speechPython
    if ($LASTEXITCODE -ne 0) { throw '音声認識に必要なソフトを取得できませんでした。' }
    & $speechPython -X utf8 speech/download_model.py
    if ($LASTEXITCODE -ne 0) { throw '認識モデルを取得できませんでした。' }
    & $speechPython -X utf8 speech/worker.py --check
    if ($LASTEXITCODE -ne 0) { throw 'このPCで音声認識を起動できませんでした。' }
} finally {
    Pop-Location
}
