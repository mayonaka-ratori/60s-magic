"""標準入出力だけでゲームと接続する、常駐の音声認識処理。"""
import base64
import json
import os
from pathlib import Path
import sys
import time

os.environ['HF_HUB_OFFLINE'] = '1'
os.environ['HF_HUB_DISABLE_TELEMETRY'] = '1'
os.environ['HF_HUB_DISABLE_PROGRESS_BARS'] = '1'

# GPU用のファイルもこのプロジェクトのPython環境内に置く。
# PC全体のPATHや他のPython環境は変更しない。
DLL_HANDLES = []
if os.name == 'nt':
    nvidia = Path(sys.prefix) / 'Lib' / 'site-packages' / 'nvidia'
    for path in nvidia.glob('*/bin'):
        DLL_HANDLES.append(os.add_dll_directory(str(path)))
        os.environ['PATH'] = str(path) + os.pathsep + os.environ.get('PATH', '')

import numpy as np
from faster_whisper import WhisperModel
from vocabulary import load_hints

ROOT = Path(__file__).resolve().parents[1]
MODEL_DIR = Path(os.environ.get('LOCAL_SPEECH_MODEL') or str(ROOT / '.local-speech/models/kotoba-v2.0'))


def send(value):
    print(json.dumps(value, ensure_ascii=False), flush=True)


def transcribe(model, audio, hotwords):
    segments, _ = model.transcribe(
        audio, language='ja', task='transcribe', beam_size=1,
        temperature=0, condition_on_previous_text=False,
        without_timestamps=True, chunk_length=15,
        vad_filter=True,
        vad_parameters={'min_speech_duration_ms': 150, 'min_silence_duration_ms': 250,
                        'speech_pad_ms': 120},
        hotwords=hotwords, no_speech_threshold=0.6, log_prob_threshold=-1.0,
    )
    parts = [segment for segment in segments
             if segment.avg_logprob >= -1.0 and segment.no_speech_prob <= 0.6]
    return ''.join(segment.text for segment in parts).strip()


def create_model():
    """NVIDIAのGPUがあればGPU、なければCPU（Macなど）で読み込む。"""
    requested = os.environ.get('LOCAL_SPEECH_DEVICE', 'auto')
    if requested not in ('auto', 'cuda', 'cpu'):
        raise ValueError('LOCAL_SPEECH_DEVICE は auto、cuda、cpu のいずれかを設定してください')
    threads = max(1, min(8, os.cpu_count() or 4))
    candidates = []
    # MacにはNVIDIAのGPUがないので、autoのときはCPUだけを試す。
    if requested == 'auto' and sys.platform == 'darwin':
        requested = 'cpu'
    if requested in ('auto', 'cuda'):
        candidates.append(('cuda', 'int8_float16'))
    if requested in ('auto', 'cpu'):
        candidates.append(('cpu', 'int8'))
    last_error = None
    for device, compute_type in candidates:
        try:
            model = WhisperModel(str(MODEL_DIR), device=device, compute_type=compute_type,
                                 cpu_threads=threads, num_workers=1, local_files_only=True)
            return model, device, compute_type
        except Exception as error:
            last_error = error
            print(f'{device} では読み込めませんでした: {error}', file=sys.stderr, flush=True)
    raise RuntimeError('認識モデルを読み込めませんでした') from last_error


def main():
    try:
        model, device, compute_type = create_model()
        hotwords, vocabulary = load_hints(model.hf_tokenizer)
        # 読み込みと初回処理は24秒が始まる前に終える。
        warmup = np.zeros(16000, dtype=np.float32)
        segments, _ = model.transcribe(warmup, language='ja', beam_size=1,
                                      condition_on_previous_text=False, without_timestamps=True)
        list(segments)
        transcribe(model, warmup, hotwords)
        send({'type': 'ready', 'model': 'kotoba-whisper-v2.0', 'device': device,
              'computeType': compute_type, 'vocabulary': vocabulary})
    except Exception as error:
        print(f'ローカル音声認識の起動に失敗しました: {error}', file=sys.stderr, flush=True)
        send({'type': 'unavailable', 'reason': 'ローカル音声認識を起動できませんでした。接続の確認をご覧ください。'})
        return 1
    if '--check' in sys.argv:
        return 0
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
            text = transcribe(model, audio, hotwords)
            send({'type': 'result', 'id': request_id, 'text': text,
                  'processingMs': round((time.perf_counter() - started) * 1000, 1)})
        except Exception as error:
            print(f'音声認識に失敗しました: {error}', file=sys.stderr, flush=True)
            send({'type': 'result', 'id': request_id, 'error': '音声を文字に変換できませんでした'})
    return 0


if __name__ == '__main__':
    sys.exit(main())
