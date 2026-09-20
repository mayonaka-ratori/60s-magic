"""標準入出力だけでゲームと接続する、常駐の音声認識処理。"""
import base64
import json
import os
from pathlib import Path
import sys
import time

os.environ['HF_HUB_DISABLE_TELEMETRY'] = '1'
os.environ['HF_HUB_DISABLE_PROGRESS_BARS'] = '1'
# 遊んでいる間は通信しない。準備（--check）のときだけ、足りないファイルの取得を許す。
if '--check' not in sys.argv:
    os.environ['HF_HUB_OFFLINE'] = '1'

# GPU用のファイルもこのプロジェクトのPython環境内に置く。
# PC全体のPATHや他のPython環境は変更しない。
DLL_HANDLES = []
if os.name == 'nt':
    nvidia = Path(sys.prefix) / 'Lib' / 'site-packages' / 'nvidia'
    for path in nvidia.glob('*/bin'):
        DLL_HANDLES.append(os.add_dll_directory(str(path)))
        os.environ['PATH'] = str(path) + os.pathsep + os.environ.get('PATH', '')

from engines import create_engine, silence
from download_model import default_preset, model_dir

ROOT = Path(__file__).resolve().parents[1]
PRESET = default_preset()
MODEL_DIR = Path(os.environ.get('LOCAL_SPEECH_MODEL') or str(model_dir(PRESET)))


def send(value):
    print(json.dumps(value, ensure_ascii=False), flush=True)


def main():
    try:
        started = time.perf_counter()
        engine = create_engine(MODEL_DIR)
        # 読み込みと初回処理は24秒が始まる前に終える。二回通すのは、
        # 一回目だけ極端に遅くなる動かし方があるため。
        for _ in range(2):
            engine.transcribe(silence(1.0))
        # 画面に出す名前は server/local-speech.ts の speechModelName が preset から決める。
        send({'type': 'ready', 'preset': PRESET, 'engine': engine.kind,
              'device': engine.device, 'computeType': engine.compute_type, 'threads': engine.threads,
              'loadMs': round((time.perf_counter() - started) * 1000), 'vocabulary': engine.vocabulary})
    except Exception as error:
        print(f'ローカル音声認識の起動に失敗しました: {error}', file=sys.stderr, flush=True)
        send({'type': 'unavailable', 'reason': 'ローカル音声認識を起動できませんでした。接続の確認をご覧ください。'})
        return 1
    if '--check' in sys.argv:
        return 0
    import numpy as np
    for line in sys.stdin:
        request_id = None
        try:
            message = json.loads(line)
            request_id = message['id']
            pcm = base64.b64decode(message['pcm'], validate=True)
            if not 0 < len(pcm) <= 448000 or len(pcm) % 2:
                raise ValueError('音声の長さが正しくありません')
            audio = np.frombuffer(pcm, dtype='<i2').astype(np.float32) / 32768.0
            started = time.perf_counter()
            text = engine.transcribe(audio)
            send({'type': 'result', 'id': request_id, 'text': text,
                  'processingMs': round((time.perf_counter() - started) * 1000, 1)})
        except Exception as error:
            print(f'音声認識に失敗しました: {error}', file=sys.stderr, flush=True)
            send({'type': 'result', 'id': request_id, 'error': '音声を文字に変換できませんでした'})
    return 0


if __name__ == '__main__':
    sys.exit(main())
