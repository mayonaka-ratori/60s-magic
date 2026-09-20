"""同じ合成音声を、追加前後の手掛かりで比較する。人の声の精度とは分ける。"""
import json
import time
import wave
from worker import WhisperModel, MODEL_DIR, ROOT, np, transcribe
from vocabulary import load_hints, BASELINE

model = WhisperModel(str(MODEL_DIR), device='cuda', compute_type='int8_float16',
                     cpu_threads=4, num_workers=1, local_files_only=True)
hints, metadata = load_hints(model.hf_tokenizer)
segments, _ = model.transcribe(np.zeros(16000, dtype=np.float32), language='ja', beam_size=1)
list(segments)
transcribe(model, np.zeros(16000, dtype=np.float32), hints)
cases = json.loads((ROOT / 'tests/fixtures/chant-audio.json').read_text(encoding='utf-8'))
results = []
for case in cases:
    with wave.open(str(ROOT / '.local-speech/test-audio' / (case['id'] + '.wav'))) as wav:
        assert wav.getframerate() == 16000 and wav.getnchannels() == 1 and wav.getsampwidth() == 2
        audio = np.frombuffer(wav.readframes(wav.getnframes()), dtype='<i2').astype(np.float32) / 32768.0
    for mode, words in [('before', BASELINE), ('after', hints)]:
        start = time.perf_counter()
        text = transcribe(model, audio, words)
        result = {'id': case['id'], 'mode': mode, 'text': text, 'processingMs': round((time.perf_counter()-start)*1000, 1)}
        results.append(result)
        print(json.dumps(result, ensure_ascii=False), flush=True)
silence = transcribe(model, np.zeros(16000*3, dtype=np.float32), hints)
(ROOT / '.local-speech/vocabulary-raw-report.json').write_text(json.dumps({
    'kind': 'Windowsで合成した日本語音声。実際の人の声ではない',
    'vocabulary': metadata, 'results': results, 'silence': silence,
}, ensure_ascii=False, indent=2), encoding='utf-8')
