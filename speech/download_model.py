"""認識に使うファイルを初回だけ取得する。実行中の認識では通信しない。"""
import json
import os
import sys
from pathlib import Path

os.environ['HF_HUB_DISABLE_TELEMETRY'] = '1'
from huggingface_hub import snapshot_download, model_info

# 名前 → 取得元、固定する版、動かし方。版がNoneのものは取得時の最新を使い、取得した版を version.json に残す。
# engine が faster のものは faster-whisper 用、mlx のものは Apple Silicon の Mac 用で、形式が違う。
PRESETS = {
    'kotoba-v2.0': {'repo': 'kotoba-tech/kotoba-whisper-v2.0-faster',
                    'revision': 'f44edd35eaeb2274e85ac7b31fb2c6f59ff1c4bc', 'engine': 'faster'},
    'medium': {'repo': 'Systran/faster-whisper-medium', 'revision': None, 'engine': 'faster'},
    'small': {'repo': 'Systran/faster-whisper-small', 'revision': None, 'engine': 'faster'},
    'base': {'repo': 'Systran/faster-whisper-base', 'revision': None, 'engine': 'faster'},
    'kotoba-v2.0-mlx': {'repo': 'kaiinui/kotoba-whisper-v2.0-mlx', 'revision': None, 'engine': 'mlx'},
    'large-v3-turbo-mlx': {'repo': 'mlx-community/whisper-large-v3-turbo', 'revision': None, 'engine': 'mlx'},
    'medium-mlx': {'repo': 'mlx-community/whisper-medium-mlx', 'revision': None, 'engine': 'mlx'},
    'small-mlx': {'repo': 'mlx-community/whisper-small-mlx', 'revision': None, 'engine': 'mlx'},
}
# 動かし方ごとに必要なファイル。余計なものは取らない。
PATTERNS = {
    'faster': ['model.bin', 'config.json', 'preprocessor_config.json',
               'tokenizer.json', 'vocabulary.*', 'README.md', '*LICENSE*'],
    'mlx': ['weights.npz', 'weights*.safetensors', 'config.json', 'README.md', '*LICENSE*'],
}
# 読み込めたことを確かめるファイル。これがなければ準備できていない。
MARKERS = {'faster': 'model.bin', 'mlx': 'weights.npz'}
ROOT = Path(__file__).resolve().parents[1]


def apple_silicon():
    return sys.platform == 'darwin' and os.uname().machine == 'arm64'


def default_preset():
    """Apple SiliconのMacはMacのGPU向け。NVIDIAのGPUがあるWindowsは日本語向けの大きなモデル。
    それ以外のCPUだけのPCは間に合う大きさのモデル。"""
    chosen = os.environ.get('LOCAL_SPEECH_MODEL_ID')
    if chosen:
        return chosen
    if apple_silicon():
        return 'kotoba-v2.0-mlx'
    return 'kotoba-v2.0' if sys.platform == 'win32' else 'small'


def preset_info(preset):
    if preset not in PRESETS:
        raise SystemExit(f'LOCAL_SPEECH_MODEL_ID は {"、".join(PRESETS)} のいずれかにしてください: {preset}')
    return PRESETS[preset]


def model_dir(preset):
    return ROOT / '.local-speech' / 'models' / preset


def model_marker(preset):
    return model_dir(preset) / MARKERS[preset_info(preset)['engine']]


def download(preset):
    info = preset_info(preset)
    target = model_dir(preset)
    snapshot_download(info['repo'], revision=info['revision'], local_dir=target,
                      allow_patterns=PATTERNS[info['engine']])
    resolved = info['revision']
    if resolved is None:
        try:
            resolved = model_info(info['repo']).sha
        except Exception:
            resolved = 'unknown'
    (target / 'version.json').write_text(json.dumps({
        'preset': preset, 'model': info['repo'], 'revision': resolved, 'engine': info['engine'],
    }, indent=2), encoding='utf-8')
    if not model_marker(preset).exists():
        raise SystemExit(f'{preset} の認識ファイルを取得できませんでした。通信を確かめてもう一度実行してください。')
    print(f'日本語の音声認識モデル（{preset}）を準備しました。', flush=True)


if __name__ == '__main__':
    download(sys.argv[1] if len(sys.argv) > 1 else default_preset())
