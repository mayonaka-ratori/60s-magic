import { spawn } from 'node:child_process';
import { readFile,writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import cases from '../tests/fixtures/chant-audio.json';
import { readChant } from '../src/game/chant-dictionary';
import { CastSession } from '../src/game/session';
import { makeRecipe } from '../src/game/recipe';
async function run(command:string,args:string[]) {
  await new Promise<void>((ok,fail)=>{const child=spawn(command,args,{windowsHide:true,stdio:'inherit'});child.on('error',fail);child.on('exit',code=>code===0?ok():fail(new Error('音声の比較を完了できませんでした')));});
}
await run('powershell',['-NoProfile','-ExecutionPolicy','Bypass','-File','scripts/make-speech-fixtures.ps1','tests/fixtures/chant-audio.json']);
await run(resolve('.venv-speech/Scripts/python.exe'),['-X','utf8','speech/benchmark-vocabulary.py']);
const report=JSON.parse(await readFile('.local-speech/vocabulary-raw-report.json','utf8'));
report.results=report.results.map((r:{id:string;mode:string;text:string;processingMs:number})=>{
  const spec=cases.find(c=>c.id===r.id)!;const session=new CastSession(()=>0);
  session.speech.add({id:0,revision:1,startMs:0,endMs:14000,text:r.text,final:true,stability:1,source:'local'});
  const recipe=makeRecipe(session.freeze()),normalized=readChant(r.text).normalized;
  const termsOk=(spec.terms??[]).every(t=>normalized.includes(t));
  const recipeOk=['element','form','count','purpose','trajectory','noAttack'].every(key=>!(key in spec)||(spec as Record<string,unknown>)[key]===(recipe as unknown as Record<string,unknown>)[key]);
  const falseWords=(spec.forbidden??[]).filter(t=>normalized.includes(t));
  return {...r,normalized,termsOk,recipeOk,falseWords,ok:termsOk&&recipeOk&&!falseWords.length,recipe:{element:recipe.element,form:recipe.form,count:recipe.count,purpose:recipe.purpose,trajectory:recipe.trajectory}};
});
type Result={id:string;mode:string;ok:boolean;termsOk:boolean;recipeOk:boolean;processingMs:number};
const results:Result[]=report.results;
report.summary=Object.fromEntries(['before','after'].map(mode=>{const rows=results.filter(r=>r.mode===mode);return [mode,{cases:rows.length,passed:rows.filter(r=>r.ok).length,terms:rows.filter(r=>r.termsOk).length,recipe:rows.filter(r=>r.recipeOk).length,maxMs:Math.max(...rows.map(r=>r.processingMs))}];}));
report.regressions=results.filter(r=>r.mode==='after'&&!r.ok&&results.find(b=>b.mode==='before'&&b.id===r.id)?.ok).map(r=>r.id);
await writeFile('.local-speech/vocabulary-test-report.json',JSON.stringify(report,null,2));
console.log(JSON.stringify({summary:report.summary,regressions:report.regressions,silence:report.silence,vocabulary:report.vocabulary},null,2));
if(report.regressions.length||report.silence)process.exitCode=1;
