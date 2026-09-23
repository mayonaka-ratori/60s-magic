"""音声認識の動かし方。PCに合わせて選ぶ。

- faster: faster-whisper。WindowsのNVIDIA GPUと、どのPCのCPUでも動く。
- mlx: Apple SiliconのMacで、MacのGPUを使って動かす。

どちらも同じ `transcribe(audio) -> str` を持つ。呼ぶ側は違いを意識しない。
"""
import os
from pathlib import Path
import sys

import numpy as np

from vocabulary import load_hints

# 声が出ていない区間を文字にしないための境目。二つの動かし方で同じ値を使う。
MIN_LOGPROB = -1.0
MAX_NO_SPEECH = 0.6


def hints_enabled(kind):
    """手掛かりの語を認識へ渡すか。LOCAL_SPEECH_HINTS が auto のときは faster だけ渡す。
    MacのGPUで動かす方式（mlx）は、前置きに語を入れると文が途中で切れたり空になったりして悪くなった
    （2026年9月20日、合成音声14件で確認）。"""
    chosen = os.environ.get('LOCAL_SPEECH_HINTS', 'auto')
    if chosen not in ('auto', 'on', 'off'):
        raise ValueError('LOCAL_SPEECH_HINTS は auto、on、off のいずれかを設定してください')
    return chosen == 'on' or (chosen == 'auto' and kind == 'faster')


def _threads():
    """CPUで動かすときは、描画を担当するブラウザーのために半分を空けておく。"""
    cores = os.cpu_count() or 4
    return int(os.environ.get('LOCAL_SPEECH_THREADS') or max(2, min(6, cores // 2)))


class FasterWhisperEngine:
    """faster-whisper。NVIDIAのGPUがあれば使い、なければCPUで動かす。"""
    kind = 'faster'

    def __init__(self, model_dir, device_request='auto'):
        from faster_whisper import WhisperModel
        if device_request not in ('auto', 'cuda', 'cpu'):
            raise ValueError('LOCAL_SPEECH_DEVICE は auto、cuda、cpu、gpu のいずれかを設定してください')
        threads = _threads()
        candidates = []
        # MacにはNVIDIAのGPUがないので、autoのときはCPUだけを試す。
        if device_request == 'auto' and sys.platform == 'darwin':
            device_request = 'cpu'
        if device_request in ('auto', 'cuda'):
            candidates.append(('cuda', 'int8_float16'))
        if device_request in ('auto', 'cpu'):
            candidates.append(('cpu', 'int8'))
        last_error = None
        for device, compute_type in candidates:
            try:
                self.model = WhisperModel(str(model_dir), device=device, compute_type=compute_type,
                                          cpu_threads=threads, num_workers=1, local_files_only=True)
                self.device, self.compute_type, self.threads = device, compute_type, threads
                break
            except Exception as error:
                last_error = error
                print(f'{device} では読み込めませんでした: {error}', file=sys.stderr, flush=True)
        else:
            raise RuntimeError('認識モデルを読み込めませんでした') from last_error
        self.hints, self.vocabulary = load_hints(self.model.hf_tokenizer, hints_enabled(self.kind))

    def transcribe(self, audio):
        segments, _ = self.model.transcribe(
            audio, language='ja', task='transcribe', beam_size=1,
            temperature=0, condition_on_previous_text=False,
            without_timestamps=True, chunk_length=15,
            vad_filter=True,
            vad_parameters={'min_speech_duration_ms': 150, 'min_silence_duration_ms': 250,
                            'speech_pad_ms': 120},
            hotwords=self.hints or None, no_speech_threshold=MAX_NO_SPEECH, log_prob_threshold=MIN_LOGPROB,
        )
        parts = [segment for segment in segments
                 if segment.avg_logprob >= MIN_LOGPROB and segment.no_speech_prob <= MAX_NO_SPEECH]
        return ''.join(segment.text for segment in parts).strip()

    def release(self):
        """続けて別のモデルを測るときに、読み込んだものを手放す。"""
        self.model = None


class MlxWhisperEngine:
    """mlx-whisper。Apple SiliconのMacで、MacのGPUを使う。"""
    kind = 'mlx'
    device = 'gpu'
    threads = None

    def __init__(self, model_dir):
        import mlx.core as mx
        import mlx_whisper
        from mlx_whisper.load_models import load_model
        self.path = str(model_dir)
        self.transcribe_fn = mlx_whisper.transcribe
        model = load_model(self.path)
        self.compute_type = str(getattr(model.encoder.conv1.weight, 'dtype', mx.float16)).replace('mlx.core.', '')
        # 手掛かりの語は文字のまま前置き（initial_prompt）として渡す。mlxには手掛かり専用の入口がない。
        # 前置きは最初の30秒の窓の解読に入る。この用途の音は一回分の受付の最長（src/game/rounds.ts の MAX_INPUT_MS）までで
        # 30秒より短いので、全体に効く。
        self.hints, self.vocabulary = load_hints(None, hints_enabled(self.kind))

    def transcribe(self, audio):
        result = self.transcribe_fn(
            audio, path_or_hf_repo=self.path, language='ja', task='transcribe',
            temperature=0, condition_on_previous_text=False,
            initial_prompt=self.hints or None, word_timestamps=False, verbose=None,
            no_speech_threshold=MAX_NO_SPEECH, logprob_threshold=MIN_LOGPROB,
        )
        parts = [segment for segment in result.get('segments', [])
                 if segment.get('avg_logprob', 0.0) >= MIN_LOGPROB
                 and segment.get('no_speech_prob', 0.0) <= MAX_NO_SPEECH]
        text = ''.join(segment.get('text', '') for segment in parts).strip()
        # 前置きをそのまま読み上げた結果は捨てる。声がないときに起きる。
        return '' if text and self.hints and text in self.hints else text

    def release(self):
        """続けて別のモデルを測るときに、読み込んだものとGPUの作業場所を手放す。"""
        import mlx.core as mx
        from mlx_whisper.load_models import load_model
        load_model.cache_clear()
        mx.clear_cache()


def mlx_available():
    """このPCでMacのGPUを使えるか。Apple SiliconのMacで、必要なソフトが入っているとき。"""
    if sys.platform != 'darwin':
        return False
    try:
        import mlx.core  # noqa: F401
        import mlx_whisper  # noqa: F401
    except Exception:
        return False
    return True


def model_kind(model_dir):
    """置いてあるファイルから、どの動かし方のモデルかを見る。"""
    path = Path(model_dir)
    if (path / 'weights.npz').exists():
        return 'mlx'
    if (path / 'model.bin').exists():
        return 'faster'
    return None


def create_engine(model_dir, engine_request=None, device_request=None):
    """動かし方を決めて読み込む。置いてあるモデルの形式が最優先で、設定はその確認に使う。"""
    engine_request = engine_request or os.environ.get('LOCAL_SPEECH_ENGINE', 'auto')
    device_request = device_request or os.environ.get('LOCAL_SPEECH_DEVICE', 'auto')
    if engine_request not in ('auto', 'faster', 'mlx'):
        raise ValueError('LOCAL_SPEECH_ENGINE は auto、faster、mlx のいずれかを設定してください')
    # 画面側とそろえて、gpu という指定も受け付ける。
    if device_request == 'gpu' and engine_request == 'auto' and sys.platform == 'darwin':
        engine_request = 'mlx'
    guess = 'mlx' if engine_request == 'mlx' or (engine_request == 'auto' and mlx_available()) else 'faster'
    kind = model_kind(model_dir) or guess
    if engine_request != 'auto' and engine_request != kind:
        raise RuntimeError(f'置いてある認識モデルは {kind} 用です。LOCAL_SPEECH_ENGINE={engine_request} とは合いません。'
                           'LOCAL_SPEECH_MODEL_ID を選び直して npm run setup:speech をやり直してください。')
    if kind == 'mlx':
        if not mlx_available():
            raise RuntimeError('この認識モデルは Apple Silicon の Mac 用です。'
                               'npm run setup:speech をやり直すか、.env の LOCAL_SPEECH_MODEL_ID を '
                               'small などに変えてください。')
        return MlxWhisperEngine(model_dir)
    return FasterWhisperEngine(model_dir, 'auto' if device_request == 'gpu' else device_request)


def silence(seconds=1.0):
    return np.zeros(int(16000 * seconds), dtype=np.float32)
