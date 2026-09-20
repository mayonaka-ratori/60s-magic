"""同じ合成音声を、手掛かりなしと手掛かりありで認識して比べる。人の声の精度とは分ける。

以前は「前」にも同じ14語を渡していたため、前後の結果が必ず同じになっていた。
"""
import json
import time
import wave

import numpy as np

from engines import create_engine
from worker import MODEL_DIR, PRESET, ROOT

engine = create_engine(MODEL_DIR)
hints, metadata = engine.hints, engine.vocabulary
warm = np.zeros(16000, dtype=np.float32)
for _ in range(2):
    engine.transcribe(warm)
cases = json.loads((ROOT / 'tests/fixtures/chant-audio.json').read_text(encoding='utf-8'))
results = []
for case in cases:
    with wave.open(str(ROOT / '.local-speech/test-audio' / (case['id'] + '.wav'))) as wav:
        assert wav.getframerate() == 16000 and wav.getnchannels() == 1 and wav.getsampwidth() == 2
        audio = np.frombuffer(wav.readframes(wav.getnframes()), dtype='<i2').astype(np.float32) / 32768.0
    for mode, words in [('none', ''), ('hints', hints)]:
        engine.hints = words
        start = time.perf_counter()
        text = engine.transcribe(audio)
        result = {'id': case['id'], 'mode': mode, 'text': text,
                  'processingMs': round((time.perf_counter() - start) * 1000, 1)}
        results.append(result)
        print(json.dumps(result, ensure_ascii=False), flush=True)
engine.hints = hints
silence = engine.transcribe(np.zeros(16000 * 3, dtype=np.float32))
(ROOT / '.local-speech/vocabulary-raw-report.json').write_text(json.dumps({
    'kind': 'PC内で作った日本語の合成音声。実際の人の声ではない',
    'preset': PRESET, 'engine': engine.kind, 'device': engine.device,
    'vocabulary': metadata, 'results': results, 'silence': silence,
}, ensure_ascii=False, indent=2), encoding='utf-8')
