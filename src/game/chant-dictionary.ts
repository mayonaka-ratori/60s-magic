import data from './chant-dictionary.json';

export type ChantWord={term:string;reading:string;spellings?:string[];group:string;meaning?:string;hint?:boolean;readingMatch?:boolean;source?:string};
export const chantDictionary=data as {version:string;localHints:string[];entries:ChantWord[];examples:string[];sources:Array<{id:string;title:string;url?:string}>};
const hiragana=(text:string)=>text.replace(/[ァ-ヶ]/g,c=>String.fromCharCode(c.charCodeAt(0)-0x60));
const variants=chantDictionary.entries.flatMap(word=>[
  {value:word.term,word,reading:false},
  ...(word.spellings??[]).map(value=>({value,word,reading:false})),
  ...(word.readingMatch===false?[]:[{value:word.reading,word,reading:true}]),
]).sort((a,b)=>b.value.length-a.value.length);

/** 似た音の推測置換はしない。元の認識結果は呼び出し側で別に保持する。 */
export function readChant(text:string) {
  const original=text.normalize('NFKC'),kana=hiragana(original);
  let normalized='',meaning='';const matched:string[]=[];
  for(let at=0;at<original.length;) {
    const found=variants.find(v=>{
      if(!(v.reading?kana:original).startsWith(v.value,at))return false;
      if(!v.reading)return true;
      // 読みが別の普通の単語の一部になった場合は置換しない。
      if(at>0&&/[ぁ-ゖー]/.test(kana[at-1])&&!/[よのをはがにでともへ]/.test(kana[at-1]))return false;
      const next=kana.slice(at+v.value.length);
      return !next||!/^[ぁ-ゖー]/.test(next)||/^(?:よ|の|を|は|が|に|で|と|も|へ|せよ|しろ|する|となれ)/.test(next);
    });
    if(found){
      normalized+=found.word.term;
      // 飾りや作品名の一文字だけを「光」「波」などと誤解しない。
      meaning+=found.word.meaning??' ';
      matched.push(found.word.term);at+=found.value.length;
    }else{normalized+=original[at];meaning+=original[at];at++;}
  }
  return {normalized,meaning,matched:[...new Set(matched)]};
}

export const speechPhrases=[...new Set(chantDictionary.entries.flatMap(w=>[w.term,w.reading]).concat([
  '氷よ壁となれ','雷よ七つに分かれろ','攻撃しないで','雷ではなく氷','我を守れ','一つ','二つ','三つ','四つ','五つ','六つ','七つ','八つ',
]))];
