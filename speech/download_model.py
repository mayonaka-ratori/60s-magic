"""認識に使うファイルを初回だけ取得する。実行中の認識では通信しない。"""
import json
import os
import sys
from pathlib import Path

os.environ['HF_HUB_DISABLE_TELEMETRY'] = '1'
from huggingface_hub import snapshot_download, model_info

# 名前 → (Hugging Faceの場所, 固定する版)。版がNoneのものは取得時の最新を使い、取得した版を version.json に残す。
PRESETS = {
    'kotoba-v2.0': ('kotoba-tech/kotoba-whisper-v2.0-faster', 'f44edd35eaeb2274e85ac7b31fb2c6f59ff1c4bc'),
    'medium': ('Systran/faster-whisper-medium', None),
    'small': ('Systran/faster-whisper-small', None),
    'base': ('Systran/faster-whisper-base', None),
}
ROOT = Path(__file__).resolve().parents[1]


def default_preset():
    """NVIDIAのGPUがあるWindowsは日本語向けの大きなモデル。MacなどCPUだけのPCは間に合う大きさのモデル。"""
    return os.environ.get('LOCAL_SPEECH_MODEL_ID') or ('small' if sys.platform == 'darwin' else 'kotoba-v2.0')


def model_dir(preset):
    return ROOT / '.local-speech' / 'models' / preset


def download(preset):
    if preset not in PRESETS:
        raise SystemExit(f'LOCAL_SPEECH_MODEL_ID は {"、".join(PRESETS)} のいずれかにしてください: {preset}')
    model_id, revision = PRESETS[preset]
    target = model_dir(preset)
    snapshot_download(
        model_id, revision=revision, local_dir=target,
        allow_patterns=['model.bin', 'config.json', 'preprocessor_config.json',
                        'tokenizer.json', 'vocabulary.*', 'README.md', '*LICENSE*'],
    )
    resolved = revision
    if resolved is None:
        try:
            resolved = model_info(model_id).sha
        except Exception:
            resolved = 'unknown'
    (target / 'version.json').write_text(json.dumps({
        'preset': preset, 'model': model_id, 'revision': resolved,
    }, indent=2), encoding='utf-8')
    print(f'日本語の音声認識モデル（{preset}）を準備しました。', flush=True)


if __name__ == '__main__':
    download(sys.argv[1] if len(sys.argv) > 1 else default_preset())
