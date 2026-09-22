import { test,expect,type Page } from '@playwright/test';
import { BATTLE_END } from '../../src/game/rounds';

// 画面に出る文字の四角形を集め、親子でない組み合わせが重なっていないか確かめる。
const watched='#timer,.trial,.brand-name,.eyebrow,.chapter,.intro,.privacy,#notice,.mode-options,.voice-option,.sound-options,#start,.welcome-actions,.enemy-health,#cancel,#sound-toggle,#calm-toggle,#service-notice,#demo-tag,#voice-label,#input-panel,.bottom-hud,#recognized,#result,#result-spell,.feedback,.report-actions';
const overlaps=(page:Page,where:string)=>page.evaluate(([sel,label])=>{
  const name=(n:Element)=>(n.id?'#'+n.id:'.'+String(n.className).split(' ')[0]);
  const shown=[...document.querySelectorAll(sel)].filter(n=>{
    const style=getComputedStyle(n),box=n.getBoundingClientRect();
    // たたんだ details の中身は見えないが、四角形だけは残るので外す。
    return style.display!=='none'&&style.visibility!=='hidden'&&Number(style.opacity)>0
      &&!n.closest('[hidden]')&&!n.closest('details:not([open])')&&box.width>2&&box.height>2;
  });
  const found:string[]=[];
  for(let i=0;i<shown.length;i++)for(let j=i+1;j<shown.length;j++) {
    const a=shown[i],b=shown[j];
    if(a.contains(b)||b.contains(a))continue;
    const x=a.getBoundingClientRect(),y=b.getBoundingClientRect();
    if(x.left<y.right&&y.left<x.right&&x.top<y.bottom&&y.top<x.bottom)
      found.push(`${label}：${name(a)}と${name(b)}が重なっている`);
  }
  return found;
},[watched,where] as const);

/**
 * 遊んでいる間の画面の様子を、ページの中で毎コマ集める。結果の画面に移ったら止める。
 * 締め切りの知らせや傷あとは数秒しか出ないので、外から間を空けて見ると、描画の遅いPCで取りこぼす。
 */
function 様子を集める(page:Page) {
  return page.addInitScript(()=>{
    const 見たもの=new Set<string>(),ひとこと=new Set<string>();
    (window as any).__様子={見たもの,ひとこと};
    const look=()=>{
      const byId=(id:string)=>document.getElementById(id) as HTMLElement|null;
      const app=byId('app'),timer=byId('timer'),deadline=byId('deadline'),reveal=byId('reveal'),hud=byId('bottom-hud'),hint=byId('hint'),knight=byId('knight'),health=byId('health');
      const frame=document.querySelector<HTMLElement>('.enemy-health');
      if(app?.dataset.screen==='result')return;
      requestAnimationFrame(look);
      if(app?.dataset.screen!=='playing'||!timer||!deadline||!reveal||!hud||!hint||!knight||!health||!frame)return;
      if(app.dataset.deadline)見たもの.add(`段階:${app.dataset.deadline}`);
      // 外周の光の濃さは画面側が毎コマ直接書き込むので、その値を読む。計算し直させて描画を重くしないため。
      if(parseFloat(deadline.style.opacity||'0')>.05)見たもの.add('外周の光');
      if(timer.hidden)見たもの.add('締め切り後は時計を消す');
      const 名前=reveal.hidden?'':byId('reveal-name')?.textContent??'';
      if(名前)見たもの.add(`魔法名:${名前}`);
      if(名前&&hud.hidden)見たもの.add('発動中は案内を閉じる');
      if(knight.dataset.scar==='1')見たもの.add('傷あと');
      if(frame.dataset.hit==='1')見たもの.add('体力バーの反応');
      // 減る量は魔法の派手さで20〜45%変わるので、値ではなく「減ったこと」を見る。
      if(parseFloat(health.style.height||'100')<99.5)見たもの.add('体力が減る');
      ひとこと.add(hint.textContent??'');
    };
    requestAnimationFrame(look);
  });
}
const 集めた様子=(page:Page)=>page.evaluate(()=>{
  const {見たもの,ひとこと}=(window as any).__様子 as {見たもの:Set<string>;ひとこと:Set<string>};
  return {見たもの:[...見たもの],ひとこと:[...ひとこと]};
});

/** 90秒を最後まで通し、描いている間から結果まで、文字の重なりを1秒ごとに集める。 */
async function playThrough(page:Page,where:string,url:string,chant?:string) {
  const found:string[]=[],errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  await 様子を集める(page);
  await page.goto(url);await expect(page.locator('#start')).toBeVisible();
  // 見本が始まるまでの待ち時間をURLで短くしても、読み込みの間に見本が始まらないよう、読み込み中も手を動かしておく。
  await expect.poll(async()=>{await page.mouse.move(5,5+Math.random()*5);return page.locator('#loading').isHidden();}).toBe(true);
  await page.locator('#start').click();await expect(page.locator('#hud')).toBeVisible();
  // 言葉は、入力欄が出たらすぐ入れる。線を描くより先に入れて、唱える時間より前に確実に間に合わせる。
  if(chant)await page.locator('#chant').fill(chant);
  const {width,height}=page.viewportSize()!;
  await page.mouse.move(width*.3,height*.45);await page.mouse.down();await page.mouse.move(width*.5,height*.58,{steps:20});await page.mouse.up();
  // 始めたら時計が出る。合図が消えてから出るので、合図の3秒ぶんを待てる長さにする。
  await expect(page.locator('#timer')).toContainText('のこり',{timeout:15000});
  // 描いている間から余韻まで、1秒ごとに見る。本編90秒の残りに余裕を足した時刻で打ち切る。
  const 打ち切り=Date.now()+BATTLE_END+10000;
  while(await page.locator('#result').isHidden()&&Date.now()<打ち切り) {
    found.push(...await overlaps(page,`${where}・${await page.locator('#timer').innerText()}`));
    await page.waitForTimeout(1000);
  }
  await expect(page.locator('#result')).toBeVisible();
  found.push(...await overlaps(page,`${where}・結果`));
  return {found:[...new Set(found)],errors};
}

test('開始前の画面は、どの大きさでも文字が重ならない',async({page})=>{
  const found:string[]=[];
  for(const size of [{width:1920,height:1080},{width:1440,height:900},{width:1280,height:800},{width:1280,height:720},{width:1024,height:768},{width:390,height:844}]) {
    await page.setViewportSize(size);
    await page.goto('/?flow=together');await expect(page.locator('#loading')).toBeHidden();
    found.push(...await overlaps(page,`${size.width}×${size.height}`));
    const bottom=await page.locator('#privacy').evaluate(n=>n.getBoundingClientRect().bottom);
    expect(bottom,`${size.width}×${size.height}で説明文が画面からはみ出す`).toBeLessThanOrEqual(size.height);
  }
  expect(found).toEqual([]);
});

test('横長で90秒を通し、文字が重ならず、締め切りと体力と魔法名を見せ、結果のまま放っておくと見本へ戻る',async({page})=>{
  // 結果は次の人の開始操作まで残すが、誰も居なくなったまま置き去りにしない。
  // 待ち時間はURLで短くできるので、ここでは短い値で流れだけを確かめる。
  const {found,errors}=await playThrough(page,'1440×900','/?attract=5&resultIdle=6&flow=together','雷よ、七つに分かれろ');
  expect(found).toEqual([]);
  // 遊ぶ人の画面では、結果になっても確認用の表示を出さない。
  await expect(page.locator('.report-actions')).toBeHidden();
  await expect(page.locator('#feedback')).toBeHidden();
  // はじめは魔法名だけを見せ、少しして残りを出す。ここまで結果が出たままなのは、下の「もう一度」が見えることで分かる。
  await expect(page.locator('#result')).not.toHaveClass(/name-only/);
  await expect(page.locator('#again')).toBeVisible();
  // 結果のまま誰も触らなければ、タイトルへ戻り、見本の自動再生に戻る。
  await expect(page.locator('#welcome')).toBeVisible({timeout:16000});
  await expect(page.locator('#demo-tag')).toBeVisible({timeout:16000});
  // 遊んでいる間に集めた様子は、結果の画面で急ぐ確認を終えてから読む。結果の画面に移ったところで集めるのを止めている。
  const {見たもの,ひとこと}=await 集めた様子(page);
  for(const 期待 of ['段階:soon','段階:urgent','外周の光','締め切り後は時計を消す','魔法名:7つの雷の連弾','発動中は案内を閉じる','傷あと','体力バーの反応','体力が減る'])
    expect(見たもの,`${期待}を見ていない`).toContain(期待);
  // もう言葉を入れた人には、詠唱の例を出さない。ふだんのひとことは出す。
  expect(ひとこと).not.toContain('たとえば「雷よ、七つに分かれろ」');
  expect(ひとこと.some(t=>t.includes('好きな言葉')||t.includes('声や文字')),'ふだんのひとことは出ている').toBe(true);
  expect(errors).toEqual([]);
});

test('縦長で90秒を通し、文字が重ならず、何も唱えない人に例を出し、結果からもう一度始められる',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  const {found,errors}=await playThrough(page,'390×844','/?flow=together');
  expect(found).toEqual([]);
  // 唱える時間になると、まだ何も言っていない人に例を出す。
  expect((await 集めた様子(page)).ひとこと).toContain('たとえば「雷よ、七つに分かれろ」');
  await page.screenshot({path:'test-results/cast-mobile-result.png'});
  // 縦長の魔導書では、術式が一番上に正方形で横いっぱいに出る。
  const shape=await page.locator('#result-spell').boundingBox();
  expect(Math.round(shape!.width)).toBe(Math.round(shape!.height));
  expect(shape!.width).toBeGreaterThan(300);
  await page.locator('#again').click();await expect(page.locator('#hud')).toBeVisible();await expect(page.locator('#countdown')).toBeHidden({timeout:15000});
  await expect(page.locator('#spell')).toHaveAttribute('data-phase','input');
  await expect(page.locator('#world')).not.toHaveClass(/spell-finished/);
  await page.screenshot({path:'test-results/cast-mobile-input.png'});
  await page.locator('#cancel').click();await expect(page.locator('#welcome')).toBeVisible();
  expect(errors).toEqual([]);
});

test.describe('このPCの「動きを減らす」設定',()=>{
  test.use({reducedMotion:'reduce'});
  test('控えめから始まるが、演出を派手にするボタンはいつでも押せる',async({page})=>{
    await page.goto('/?flow=together');await expect(page.locator('#loading')).toBeHidden();
    await page.locator('.sound-settings summary').click();
    const button=page.locator('#calm-option');
    await expect(button).toHaveText('演出を派手にする');
    await expect(button).toBeEnabled();
    await expect(page.locator('body')).toHaveAttribute('data-calm','on');
    await button.click();
    await expect(button).toHaveText('演出を控えめにする');
    await expect(page.locator('body')).toHaveAttribute('data-calm','off');
    // 選んだほうは覚えていて、開き直しても派手のまま。
    await page.reload();await expect(page.locator('#loading')).toBeHidden();
    await expect(page.locator('body')).toHaveAttribute('data-calm','off');
  });
});

test('確認用の表示は、遊ぶ人には出さず ?dev=1 でだけ出す',async({page})=>{
  // 始めたときの時計と、結果の画面での確認は、上の横長の通しで見ている。ここは90秒を通さない。
  await page.goto('/?flow=together');await expect(page.locator('#loading')).toBeHidden();
  for(const target of ['.trial','#settings','.dev-only'])await expect(page.locator(target).first()).toBeHidden();
  await page.goto('/?dev=1&flow=together');await expect(page.locator('.trial')).toBeVisible();await expect(page.locator('#settings')).toBeVisible();
});

test('1920×1080で、案内の文字が決めた大きさを下回らない',async({page})=>{
  // Xboxの指針は1080pで最小28px、設計仕様は操作指示を36〜44pxとしている。
  // 過去に上書きの24px指定が clamp を打ち消していたので、ここで見張る。
  await page.setViewportSize({width:1920,height:1080});
  await page.goto('/?flow=together');await expect(page.locator('#start')).toBeVisible();await expect(page.locator('#loading')).toBeHidden();
  await page.locator('#start').click();await expect(page.locator('#bottom-hud')).toBeVisible();
  const 下限:Record<string,number>={'#instruction':36,'#hint':16,'.steps span':16,'.enemy-health':20,'#timer b':30,'#timer small':15,'#cancel':14,'.input-panel label':15};
  for(const [target,min] of Object.entries(下限)) {
    const size=await page.evaluate(sel=>{const n=document.querySelector(sel);return n?parseFloat(getComputedStyle(n).fontSize):NaN;},target);
    expect(size,`${target}の文字が${min}pxより小さい`).toBeGreaterThanOrEqual(min);
  }
  await expect(page.locator('#instruction')).toHaveText('押したまま、自由に描こう');
  const 行数=await page.locator('#instruction').evaluate(n=>{const range=document.createRange();range.selectNodeContents(n);return range.getClientRects().length;});
  expect(行数,'見出しが折り返している').toBe(1);
});
