import data from './chant-dictionary.json';

export type ChantWord={term:string;reading:string;spellings?:string[];group:string;meaning?:string;hint?:boolean;readingMatch?:boolean;source?:string};
export type ChantCorrection={from:string;to:string;reading:string};
export const chantDictionary=data as {version:string;localHints:string[];entries:ChantWord[];examples:string[];sources:Array<{id:string;title:string;url?:string}>};
const hiragana=(text:string)=>text.replace(/[ァ-ヶ]/g,c=>String.fromCharCode(c.charCodeAt(0)-0x60));
const variants=chantDictionary.entries.flatMap(word=>[
  {value:word.term,word,reading:false},
  ...(word.spellings??[]).map(value=>({value,word,reading:false})),
  ...(word.readingMatch===false?[]:[{value:word.reading,word,reading:true}]),
]).sort((a,b)=>b.value.length-a.value.length);

// かなの母音。伸ばす音を前の文字の母音へ直すのに使う。
const VOWELS='あいうえお';
const ROWS=[
  'あかさたなはまやらわがざだばぱぁゃゎ',
  'いきしちにひみりゐぎじぢびぴぃ',
  'うくすつぬふむゆるぐずづぶぷぅゅ',
  'えけせてねへめれゑげぜでべぺぇ',
  'おこそとのほもよろをごぞどぼぽぉょ',
];
const vowelOf=(letter:string)=>{const row=ROWS.findIndex(value=>value.includes(letter));return row<0?'':VOWELS[row];};

/** 聞き取りの揺れを外した、比べるためのかな。濁点と伸ばす音の書き方だけを直し、文字数は変えない。 */
function soundKey(text:string) {
  const plain=hiragana(text.normalize('NFKC')).normalize('NFD').replace(/[゙゚]/g,'').normalize('NFC');
  let out='';
  for(const letter of plain)out+=letter==='ー'?(vowelOf(out.at(-1)??'')||'ー'):letter;
  // 「えい」と「ええ」、「おう」と「おお」は同じ音として扱う。
  return out.replace(/([えけせてねへめれゑぇ])い/g,'$1え').replace(/([おこそとのほもよろをょ])う/g,'$1お');
}

/** 音の揺れを外しても残る違いの数。limit を超えたら数えるのをやめる。 */
function within(a:string,b:string,limit:number) {
  if(a.length!==b.length)return false;
  let differences=0;
  for(let i=0;i<a.length;i++){if(a[i]!==b[i]&&++differences>limit)return false;}
  return true;
}

// 音で寄せる先。三文字以上の読みだけを見る。短い言葉は一文字違うと別の言葉になりやすい。
const nearby=variants.filter(v=>v.reading&&v.value.length>=3)
  .map(v=>({...v,key:soundKey(v.value)}))
  .filter(v=>v.key.length>=3)
  .sort((a,b)=>b.key.length-a.key.length);

/** 前後の文字を見て、普通の言葉の一部を切り取っていないか確かめる。 */
function standsAlone(kana:string,at:string|number,length:number) {
  const start=at as number;
  if(start>0&&/[ぁ-ゖー]/.test(kana[start-1])&&!/[よのをはがにでともへ]/.test(kana[start-1]))return false;
  const next=kana.slice(start+length);
  return !next||!/^[ぁ-ゖー]/.test(next)||/^(?:よ|の|を|は|が|に|で|と|も|へ|せよ|しろ|する|となれ)/.test(next);
}

/**
 * 元の文字を辞書の言葉へ読み替える。まず完全に同じものを探し、
 * 見つからないときだけ、同じ文字数で音の揺れだけが違うものへ寄せる。
 * 文字数が変わる推測はしない。元の認識結果は呼び出し側で別に保持する。
 */
export function readChant(text:string) {
  const original=text.normalize('NFKC'),kana=hiragana(original);
  let normalized='',meaning='';const matched:string[]=[],corrections:ChantCorrection[]=[];
  // 同じ場所の同じ長さを何度も作り直さない。
  const keys=new Map<number,string>();
  for(let at=0;at<original.length;) {
    keys.clear();
    const found=variants.find(v=>{
      if(!(v.reading?kana:original).startsWith(v.value,at))return false;
      if(!v.reading)return true;
      // 読みが別の普通の単語の一部になった場合は置換しない。
      return standsAlone(kana,at,v.value.length);
    });
    if(found){
      normalized+=found.word.term;
      // 飾りや作品名の一文字だけを「光」「波」などと誤解しない。
      meaning+=found.word.meaning??' ';
      matched.push(found.word.term);at+=found.value.length;continue;
    }
    // 四文字までは書き方の揺れだけを直す。五文字以上は一文字の違いまで許す。
    const near=nearby.find(v=>{
      const length=v.key.length;
      if(at+length>kana.length)return false;
      let key=keys.get(length);
      if(key===undefined){key=soundKey(kana.slice(at,at+length));keys.set(length,key);}
      if(!within(key,v.key,length>=5?1:0))return false;
      return standsAlone(kana,at,length);
    });
    if(near){
      const from=original.slice(at,at+near.key.length);
      normalized+=near.word.term;meaning+=near.word.meaning??' ';matched.push(near.word.term);
      if(from!==near.word.term)corrections.push({from,to:near.word.term,reading:near.value});
      at+=near.key.length;continue;
    }
    normalized+=original[at];meaning+=original[at];at++;
  }
  return {normalized,meaning,matched:[...new Set(matched)],corrections};
}

export const speechPhrases=[...new Set(chantDictionary.entries.flatMap(w=>[w.term,w.reading]).concat([
  '氷よ壁となれ','雷よ七つに分かれろ','攻撃しないで','雷ではなく氷','我を守れ','一つ','二つ','三つ','四つ','五つ','六つ','七つ','八つ',
]))];
