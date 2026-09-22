"""重い認識モデルだけ置き換え、本物の音声受付処理を動かす。"""
from pathlib import Path
import runpy
import sys
import types


class Recognizer:
    kind = 'test'
    device = 'cpu'
    compute_type = 'test'
    threads = 1
    vocabulary = []

    def transcribe(self, audio):
        return '受付成功'


engines = types.ModuleType('engines')
engines.create_engine = lambda _: Recognizer()
engines.silence = lambda _: []
sys.modules['engines'] = engines
models = types.ModuleType('download_model')
models.default_preset = lambda: 'test'
models.model_dir = lambda _: Path('.')
sys.modules['download_model'] = models

runpy.run_path(str(Path(__file__).resolve().parents[2] / 'speech' / 'worker.py'), run_name='__main__')
