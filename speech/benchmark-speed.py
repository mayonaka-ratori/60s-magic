"""準備できているモデルの速さを、同じ音声で測る。どれを使うか決めるための道具。

ゲームは毎回「先頭から今まで」を聞き直すので、同じように長さを変えて測る。
実際の人の声ではなく、PC内で作った確認用の音声を使う。
"""
import json
import statistics
import sys
import time
import wave
from pathlib import Path

import numpy as np

from download_model import PRESETS, model_dir, model_marker
from engines import create_engine

ROOT = Path(__file__).resolve().parents[1]
AUDIO_DIR = ROOT / '.local-speech/test-audio'
REPORT = ROOT / '.local-speech/speed-report.json'
# 実際の詠唱に近い長さ。14秒が入力の締め切り。
LENGTHS = (3, 7, 11, 14)
ROUNDS = 3
# 14秒で入力を締めたあと、最後の文字を待てる時間。src/game/session.ts の SPEECH_WAIT_MS と同じ。
WAIT_MS = 1400
# 途中結果を出す間隔。server/local-speech-session.ts と同じ。
INTERVAL_MS = 650


def read_wav(path):
    with wave.open(str(path)) as wav:
        if wav.getframerate() != 16000 or wav.getnchannels() != 1 or wav.getsampwidth() != 2:
            raise SystemExit(f'16kHz・一チャンネル・16bitの音声を使ってください: {path.name}')
        return np.frombuffer(wav.readframes(wav.getnframes()), dtype='<i2').astype(np.float32) / 32768.0


def build_audio():
    """確認用の音声をつないで、14秒の詠唱に近いものを作る。"""
    files = sorted(AUDIO_DIR.glob('*.wav'))
    if not files:
        raise SystemExit('確認用の音声がありません。先に npm run make:speech-fixtures を実行してください。')
    gap = np.zeros(int(16000 * 0.3), dtype=np.float32)
    parts, total, target = [], 0, 16000 * max(LENGTHS)
    while total < target:
        for path in files:
            clip = read_wav(path)
            parts.extend([clip, gap])
            total += len(clip) + len(gap)
            if total >= target:
                break
    return np.concatenate(parts)[:target]


def measure(preset, audio):
    engine = create_engine(model_dir(preset))
    # 一回目だけ極端に遅い動かし方があるので、測る前に二回通す。
    warm = audio[:16000 * 2]
    for _ in range(2):
        engine.transcribe(warm)
    rows = []
    for seconds in LENGTHS:
        clip = audio[:16000 * seconds]
        times, text = [], ''
        for _ in range(ROUNDS):
            started = time.perf_counter()
            text = engine.transcribe(clip)
            times.append((time.perf_counter() - started) * 1000)
        rows.append({'seconds': seconds, 'medianMs': round(statistics.median(times), 1),
                     'minMs': round(min(times), 1), 'maxMs': round(max(times), 1), 'text': text})
    result = {'preset': preset, 'engine': engine.kind, 'device': engine.device,
              'computeType': getattr(engine, 'compute_type', None), 'threads': engine.threads,
              'rows': rows}
    if hasattr(engine, 'release'):
        engine.release()
    return result


def judge(result):
    """14秒ぶんの認識が締め切りに間に合うか。あわせて途中結果を何回出せるか。"""
    last = next(row for row in result['rows'] if row['seconds'] == max(LENGTHS))
    ms = last['medianMs']
    fits = ms <= WAIT_MS
    updates = int(14000 // (ms + INTERVAL_MS))
    note = f'間に合う（{round((WAIT_MS - ms) / 1000, 2)}秒の余裕）' if fits \
        else f'間に合わない（{round((ms - WAIT_MS) / 1000, 2)}秒足りない）'
    return {'fitsDeadline': fits, 'lastMs': ms, 'updatesIn14s': updates, 'note': note}


def main():
    presets = sys.argv[1:] or [name for name in PRESETS if model_marker(name).exists()]
    missing = [name for name in presets if not model_marker(name).exists()]
    if missing:
        raise SystemExit(f'準備できていないモデルがあります: {"、".join(missing)}\n'
                         f'LOCAL_SPEECH_MODEL_ID={missing[0]} npm run setup:speech で取得してください。')
    if not presets:
        raise SystemExit('準備できているモデルがありません。先に npm run setup:speech を実行してください。')
    audio = build_audio()
    results = []
    for preset in presets:
        print(f'--- {preset} を測っています ---', flush=True)
        result = measure(preset, audio)
        result['verdict'] = judge(result)
        results.append(result)
        row = '  '.join(f'{item["seconds"]}秒:{item["medianMs"] / 1000:.2f}s' for item in result['rows'])
        print(f'{preset}（{result["engine"]} / {result["device"]}）  {row}  → {result["verdict"]["note"]}'
              f'  途中結果は14秒で{result["verdict"]["updatesIn14s"]}回', flush=True)
        print(f'  聞き取り: {result["rows"][-1]["text"][:80]}', flush=True)
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text(json.dumps({
        'kind': 'PC内で作った確認用の音声。実際の人の声ではない',
        'waitMs': WAIT_MS, 'intervalMs': INTERVAL_MS, 'rounds': ROUNDS, 'results': results,
    }, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'\n結果を {REPORT.relative_to(ROOT)} に保存しました。', flush=True)
    return 0


if __name__ == '__main__':
    sys.exit(main())
