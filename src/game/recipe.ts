import { ELEMENTS, FORMS, PURPOSES, TRAJECTORIES, ELEMENT_LABELS, FORM_LABELS, type Answer, type Element, type Form, type Purpose, type Recipe, type SpellState, type JevReply } from './types';
import { clamp } from './motion';
import { readChant } from './chant-dictionary';

const elementWords: Array<[Element,RegExp]> = [['fire',/炎|火|紅蓮|燃/],['ice',/氷|凍|氷晶/],['lightning',/雷|稲妻|電撃/],['wind',/風|嵐|気流/],['light',/光|輝|照ら/],['dark',/闇|影|冥府/]];

export function affirmativeText(text:string) {
  // 明示的な言い直しは後半を使う。否定した属性・用途を辞書で拾わない。
  return text.replace(/[^、。！？]*?(?:ではなく|じゃなく|でなく)/g,'')
    .replace(/(?:攻撃|防御|炎|火|氷|雷|風|光|闇|壁|結界|縛る|強化|追尾|螺旋)(?:は|を|で)?(?:使わない|いらない|要らない|出さない|しないで|するな)/g,'')
    .replace(/守らないで|守るな|守らなくていい/g,'');
}
export function explicitCount(text:string):number|null {
  const digits=text.match(/(\d{1,3})\s*(?:つ|本|個|発|体|枚)/);
  if(digits)return clamp(Number(digits[1]),1,8);
  const match=text.match(/([一二三四五六七八九十百])(?:つ|本|個|発|体|枚)/);
  if(match)return Math.min(8,({'一':1,'二':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9,'十':10,'百':100} as Record<string,number>)[match[1]]);
  return null;
}
function choice(a:Answer|undefined, allowed:readonly string[]) {
  if(a?.type!=='choice' || !a.probabilities || typeof a.choice!=='string' || !allowed.includes(a.choice))return null;
  const entries=Object.entries(a.probabilities);
  if(entries.some(([k,v])=>!allowed.includes(k)&&k!=='unknown'||!Number.isFinite(v)||v<0||v>1))return null;
  if(Math.abs(entries.reduce((sum,[,v])=>sum+v,0)-1)>0.05)return null;
  const ranks=entries.sort((a,b)=>b[1]-a[1]);
  if(ranks[0]?.[0]!==a.choice || ranks[0][1]<0.65 || ranks[0][1]-(ranks[1]?.[1]??0)<0.2)return null;
  return a.choice;
}
function score(a:Answer|undefined) {return a?.type==='score'&&typeof a.score==='number'&&Number.isFinite(a.score)&&a.score>=0&&a.score<=2&&typeof a.confidence==='number'&&a.confidence>=0.5&&a.confidence<=1?a.score/2:null;}
function noul(a:Answer|undefined) {return a?.type==='noul'&&typeof a.noul==='number'&&Number.isFinite(a.noul)&&a.noul>=0&&a.noul<=1?(a.noul>=0.75?true:a.noul<=0.25?false:null):null;}

export function makeRecipe(state:SpellState, reply?:JevReply):Recipe {
  const text=affirmativeText(readChant(state.speech.normalizedTranscript).meaning);
  const motion=state.motion;
  // 属性語は言った順に並べる。先頭が主属性、二つ目は飾り色。3つ以上あっても最初の2つだけ使う。
  const matchedElements=elementWords.filter(([,re])=>re.test(text)).sort((a,b)=>text.search(a[1])-text.search(b[1]));
  const wordElement=matchedElements[0]?.[0]??null;
  const wordAccent=matchedElements[1]?.[0]??null;
  const noAttack=/攻撃(?:は|を)?しないで|攻撃するな|傷つけないで/.test(state.speech.rawTranscript);
  let wordPurpose:Purpose|null=null, wordForm:Form|null=null;
  if(/守|壁|障壁|結界|防げ/.test(text)||noAttack)wordPurpose='defend';
  else if(/縛|捕ら|閉じ込|動くな|拘束/.test(text))wordPurpose='bind';
  else if(/我に力|強化|力を貸|強くな/.test(text))wordPurpose='enhance';
  else if(/撃|穿|貫|倒|燃や|切|裂/.test(text))wordPurpose='attack';
  if(/壁|障壁/.test(text))wordForm='wall';else if(/結界|包め|覆え/.test(text))wordForm='dome';
  else if(/波|押し流/.test(text))wordForm='wave';else if(/線|光線|貫|穿/.test(text))wordForm='beam';
  else if(/球|玉/.test(text))wordForm='orb';else if(/群|分かれ|連弾/.test(text))wordForm='swarm';
  const count=explicitCount(text);
  if(count!==null&&count>1)wordForm='swarm';
  const recipe:Recipe={version:'recipe-1',accent:null,element:wordElement??'neutral',purpose:wordPurpose??'attack',
    form:wordForm??(motion.closedness>0.82?'orb':motion.coverageWidth>0.42&&motion.coverageHeight<0.2?'wave':'beam'),
    trajectory:'straight',count:count??1,explicitCount:count,defense:wordPurpose==='defend'?0.8:motion.closedness>0.8?0.6:motion.hasMovement?0.2:0.5,
    area:clamp(Math.max(motion.coverageWidth,motion.coverageHeight)*1.3,0.2,1),duration:0.5,concentration:motion.convergence,
    enclosure:/囲|包|結界|縛/.test(text),split:/分かれ|分裂/.test(text),developsPrevious:null,motionSpeechAligned:null,
    noAttack,name:'',source:'local',decisions:{},assistance:[],model:null};
  for(const key of ['element','purpose','form','trajectory','defense','area','duration','concentration','enclosure','split','developsPrevious','motionSpeechAligned'])recipe.decisions[key]={source:'default',reason:'材料がないため既定値'};
  for(const key of ['form','area','concentration'])recipe.decisions[key]={source:'motion',reason:'今回の線から計算'};
  if(wordElement)recipe.decisions.element={source:'word',reason:wordAccent?'現在の肯定された属性語。先に言った方を主属性にし、二つ目は飾り色':'現在の肯定された属性語'};
  if(wordPurpose)recipe.decisions.purpose={source:'word',reason:'現在の用途の言葉'};
  if(wordForm)recipe.decisions.form={source:'word',reason:count&&count>1?'明示された個数':'現在の形の言葉'};
  if(/追尾|追え/.test(text)){recipe.trajectory='homing';recipe.decisions.trajectory={source:'word',reason:'追う指示を明示'};}
  else if(/螺旋/.test(text)){recipe.trajectory='spiral';recipe.decisions.trajectory={source:'word',reason:'螺旋の指示を明示'};}
  if(wordPurpose==='defend')recipe.decisions.defense={source:'word',reason:'守る意味を明示'};
  for(const key of ['enclosure','split'] as const)if(recipe[key])recipe.decisions[key]={source:'word',reason:'現在の変化の言葉'};
  const valid=reply?.sessionId===state.sessionId&&reply.castId===state.castId&&reply.inputRevision===state.inputRevision&&reply.status==='ok';
  const answers=valid?reply.answers??{}:{};
  let used=0;
  for(const [key,allowed] of [['element',ELEMENTS],['purpose',PURPOSES],['form',FORMS],['trajectory',TRAJECTORIES]] as const) {
    if(recipe.decisions[key].source==='word')continue;
    const value=choice(answers[key],allowed);
    if(value!==null) { (recipe as unknown as Record<string,unknown>)[key]=value;recipe.decisions[key]={source:'jev',reason:'候補の確率と差が基準以上'};used++; }
  }
  const evidence=Boolean(text)||motion.hasMovement;
  for(const key of ['defense','area','duration','concentration'] as const) {
    const value=score(answers[key]);
    if(value!==null&&evidence&&recipe.decisions[key].source!=='word') { recipe[key]=value;recipe.decisions[key]={source:'jev',reason:'確かさが基準以上で入力あり'};used++; }
  }
  for(const key of ['enclosure','split','developsPrevious','motionSpeechAligned'] as const) {
    const value=noul(answers[key]);
    if(value!==null&&recipe.decisions[key].source!=='word') {recipe[key]=key==='developsPrevious'?false:value;recipe.decisions[key]={source:'jev',reason:'はい・いいえの確率が基準外の曖昧な範囲にない'};used++;}
  }
  // 飾り色。主属性と違う属性語のうち、一番先のものを使う。同じなら飾り色はなし。
  recipe.accent=[wordElement,wordAccent].find(e=>e&&e!==recipe.element)??null;
  if(noAttack)recipe.purpose='defend';
  if(recipe.purpose==='defend'&&!wordForm)recipe.form=recipe.enclosure?'dome':'wall';
  if(recipe.purpose==='bind')recipe.enclosure=true;
  if(recipe.form==='wall'&&recipe.trajectory==='homing')recipe.trajectory='straight';
  if(recipe.split&&count===null&&['orb','beam','swarm'].includes(recipe.form))recipe.count=4;
  if(recipe.form==='swarm'&&count===null)recipe.count=recipe.split?4:3;
  if(!motion.hasMovement)recipe.assistance.push('動きがないため中央の光点を使用');
  if(!state.speech.rawTranscript)recipe.assistance.push('詠唱を記録できませんでした');
  if(!valid)recipe.assistance.push(reply?.status==='unconfigured'?'Jev未設定のためPC内の規則を使用':'Jevの回答を使用せずPC内の規則を使用');
  recipe.source=used===0?'local':Object.values(recipe.decisions).every(d=>d.source==='jev')?'jev':'mixed';
  recipe.model=used?reply?.model??null:null;
  recipe.name=`${recipe.count>1?`${recipe.count}つの`:''}${recipe.element==='neutral'?'はじまりの':ELEMENT_LABELS[recipe.element]+'の'}${recipe.purpose==='bind'?'縛り':recipe.purpose==='enhance'?'力':FORM_LABELS[recipe.form]}`;
  return recipe;
}
