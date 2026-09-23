"""準備できているモデルの速さを、同じ音声で測る。どれを使うか決めるための道具。

ゲームは毎回「先頭から今まで」を聞き直すので、同じように長さを変えて測る。
実際の人の声ではなく、PC内で作った確認用の音声を使う。
声を待つ時間と声の最長は src/game/rounds.ts の値を scripts/benchmark-speech.mjs から受け取る。
npm run benchmark:speech から動かす。
"""
import json
import os
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
ROUNDS = 3


def game_value(name):
    """src/game/rounds.ts の値。呼び出す側のスクリプトが環境変数で渡す。"""
    value = os.environ.get(f'GAME_{name}')
    if not value:
        raise SystemExit(f'{name} が渡されていません。npm run benchmark:speech から実行してください。')
    return int(value)


# 入力を締めたあと、最後の文字を待てる時間。src/game/rounds.ts の SPEECH_WAIT_MS。
WAIT_MS = game_value('SPEECH_WAIT_MS')
# 一回分の声の最長。src/game/rounds.ts の MAX_INPUT_MS（二つの遊び方の表で、いちばん長い受付）。
MAX_MS = game_value('MAX_INPUT_MS')
# 最長を四つに分けた長さで測る。いちばん長いものが入力の締め切りにあたる。
LENGTHS_MS = tuple(MAX_MS * step // 4 for step in (1, 2, 3, 4))
# 途中結果を出す間隔。server/local-speech-session.ts と同じ。
INTERVAL_MS = 650


def read_wav(path):
    with wave.open(str(path)) as wav:
        if wav.getframerate() != 16000 or wav.getnchannels() != 1 or wav.getsampwidth() != 2:
            raise SystemExit(f'16kHz・一チャンネル・16bitの音声を使ってください: {path.name}')
        return np.frombuffer(wav.readframes(wav.getnframes()), dtype='<i2').astype(np.float32) / 32768.0


def build_audio():
    """確認用の音声をつないで、いちばん長い受付いっぱいの詠唱に近いものを作る。"""
    files = sorted(AUDIO_DIR.glob('*.wav'))
    if not files:
        raise SystemExit('確認用の音声がありません。先に npm run make:speech-fixtures を実行してください。')
    gap = np.zeros(int(16000 * 0.3), dtype=np.float32)
    parts, total, target = [], 0, 16 * MAX_MS
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
    for length_ms in LENGTHS_MS:
        clip = audio[:16 * length_ms]
        times, text = [], ''
        for _ in range(ROUNDS):
            started = time.perf_counter()
            text = engine.transcribe(clip)
            times.append((time.perf_counter() - started) * 1000)
        rows.append({'seconds': round(length_ms / 1000, 2), 'medianMs': round(statistics.median(times), 1),
                     'minMs': round(min(times), 1), 'maxMs': round(max(times), 1), 'text': text})
    result = {'preset': preset, 'engine': engine.kind, 'device': engine.device,
              'computeType': getattr(engine, 'compute_type', None), 'threads': engine.threads,
              'rows': rows}
    if hasattr(engine, 'release'):
        engine.release()
    return result


def judge(result):
    """いちばん長い受付ぶんの認識が締め切りに間に合うか。あわせて途中結果を何回出せるか。"""
    ms = result['rows'][-1]['medianMs']
    fits = ms <= WAIT_MS
    updates = int(MAX_MS // (ms + INTERVAL_MS))
    note = f'間に合う（{round((WAIT_MS - ms) / 1000, 2)}秒の余裕）' if fits \
        else f'間に合わない（{round((ms - WAIT_MS) / 1000, 2)}秒足りない）'
    return {'fitsDeadline': fits, 'lastMs': ms, 'updatesInWindow': updates, 'note': note}


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
        row = '  '.join(f'{item["seconds"]:g}秒:{item["medianMs"] / 1000:.2f}s' for item in result['rows'])
        print(f'{preset}（{result["engine"]} / {result["device"]}）  {row}  → {result["verdict"]["note"]}'
              f'  途中結果は{MAX_MS / 1000:g}秒で{result["verdict"]["updatesInWindow"]}回', flush=True)
        print(f'  聞き取り: {result["rows"][-1]["text"][:80]}', flush=True)
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text(json.dumps({
        'kind': 'PC内で作った確認用の音声。実際の人の声ではない',
        'waitMs': WAIT_MS, 'maxInputMs': MAX_MS, 'intervalMs': INTERVAL_MS, 'rounds': ROUNDS, 'results': results,
    }, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'\n結果を {REPORT.relative_to(ROOT)} に保存しました。', flush=True)
    return 0


if __name__ == '__main__':
    sys.exit(main())
