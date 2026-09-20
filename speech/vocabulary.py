"""ゲームと共通の辞書から、長すぎない音声認識用の手掛かりを作る。"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def load_hints(tokenizer=None):
    """tokenizer を渡すと語の長さも数える。数え方を持たない動かし方では省略できる。"""
    data = json.loads((ROOT / 'src/game/chant-dictionary.json').read_text(encoding='utf-8'))
    # 20語・41語への増加で通常の詠唱まで欠落した。実測で通った14語を維持する。
    # 全110語は文字の読みと意味の確認に使う。hint=trueは今後比較する候補。
    words = data['localHints']
    text = '、'.join(words)
    tokens = len(tokenizer.encode(' ' + text).ids) if tokenizer is not None else None
    if tokens is not None and tokens > 64:
        raise ValueError('音声認識の手掛かりが長すぎます。test:chants で比較してください。')
    return text, {'version': data['version'], 'dictionaryWords': len(data['entries']),
                  'hintWords': len(words), 'hintTokens': tokens,
                  'candidateWords': sum(bool(e.get('hint')) for e in data['entries'])}
