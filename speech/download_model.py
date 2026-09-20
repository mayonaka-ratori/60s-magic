"""認識に使うファイルを初回だけ取得する。実行中の認識では通信しない。"""
import json
import os
from pathlib import Path

os.environ['HF_HUB_DISABLE_TELEMETRY'] = '1'
from huggingface_hub import snapshot_download

MODEL_ID = 'kotoba-tech/kotoba-whisper-v2.0-faster'
REVISION = 'f44edd35eaeb2274e85ac7b31fb2c6f59ff1c4bc'
MODEL_DIR = Path(__file__).resolve().parents[1] / '.local-speech' / 'models' / 'kotoba-v2.0'

if __name__ == '__main__':
    snapshot_download(
        MODEL_ID, revision=REVISION, local_dir=MODEL_DIR,
        allow_patterns=['model.bin', 'config.json', 'preprocessor_config.json',
                        'tokenizer.json', 'vocabulary.json', 'README.md', '*LICENSE*'],
    )
    (MODEL_DIR / 'version.json').write_text(json.dumps({
        'model': MODEL_ID, 'revision': REVISION,
    }, indent=2), encoding='utf-8')
    print('日本語の音声認識モデルを準備しました。', flush=True)
