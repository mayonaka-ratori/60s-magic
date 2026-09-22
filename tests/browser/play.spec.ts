import { test,expect } from '@playwright/test';
import { ROUNDS } from '../../src/game/rounds';
import { AIM } from '../../src/game/guard';

/** 狙いの印のまわりを、マウスで大きく一周する。囲えば盾になる。 */
async function encircleAim(page:import('@playwright/test').Page,radiusX=150,radiusY=170) {
  const box=await page.locator('#magic').boundingBox();
  // 狙いの輪の場所は guard.ts の AIM から取る。数字を書き写すと、印の置き方が変わったときにずれる。
  const cx=box!.x+box!.width*AIM.x,cy=box!.y+box!.height*AIM.y;
  await page.mouse.move(cx+radiusX,cy);await page.mouse.down();
  for(let i=1;i<=28;i++){const a=i/28*Math.PI*2;await page.mouse.move(cx+Math.cos(a)*radiusX,cy+Math.sin(a)*radiusY);}
  await page.mouse.up();
}

test('90秒を最後まで遊び、七つの雷と、印を囲んだ盾と、とどめの魔法を記録できる',async({page})=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/?dev=1&flow=together');await expect(page.locator('#loading')).toBeHidden();await page.screenshot({path:'test-results/01-ready.png'});
  await page.locator('#start').click();await expect(page.locator('#countdown')).toBeHidden({timeout:15000});await expect(page.locator('#hud')).toBeVisible();
  await page.locator('#chant').fill('雷よ、七つに分かれろ');
  await page.mouse.move(460,450);await page.mouse.down();
  for(let i=0;i<60;i++){await page.mouse.move(650+Math.sin(i/10)*190,420+Math.cos(i/10)*120);await page.waitForTimeout(35);}
  await page.mouse.up();await page.waitForTimeout(1700);
  await page.mouse.move(720,460);await page.mouse.down();await page.mouse.move(840,330,{steps:24});await page.mouse.up();
  await expect(page.locator('#instruction')).toHaveText('そのまま、描き足して',{timeout:10000});await page.screenshot({path:'test-results/02-drawing.png'});
  await expect(page.locator('#instruction')).toHaveText('描きながら、言葉を添えて',{timeout:11000});
  // 詠唱の案内から締め切りまで、手を止めずに描く。これで下の rawPoints が
  // 「締め切り近くまで受け付けていた」ことを見られる。締め切りを過ぎた点は記録側が落とす。
  // コマ数ではなく時計で測る。遅いPCでコマ送りが重くなっても、締め切りを大きく過ぎない。
  const 描き終わり=Date.now()+(ROUNDS[0].inputEnd-ROUNDS[0].chant!);
  await page.mouse.move(550,480);await page.mouse.down();
  for(let i=0;Date.now()<描き終わり;i++){await page.mouse.move(550+Math.sin(i/7)*130,400+Math.cos(i/7)*110);await page.waitForTimeout(100);}
  await page.mouse.up();
  await expect(page.locator('#step-complete')).toHaveClass('active',{timeout:8000});await page.screenshot({path:'test-results/03-complete.png'});
  await expect(page.locator('#spell')).toHaveAttribute('data-phase','complete');
  await page.waitForTimeout(2400);await page.screenshot({path:'test-results/03b-formed.png'});
  await expect(page.locator('#step-release')).toHaveClass('active',{timeout:7000});await page.waitForTimeout(650);await page.screenshot({path:'test-results/04-release.png'});
  await page.waitForTimeout(950);
  // 合成の目印。23〜24秒あたりで、合成を見せている（on）か、遅くて諦めた（gaveUp）かのどちらかになっている。どちらでも合格。
  const composite=await page.waitForFunction(()=>{
    const canvas=document.querySelector<HTMLCanvasElement>('#composite');
    if(canvas?.dataset.on==='true')return '見せている';
    if(canvas?.dataset.gaveUp==='true')return '遅くて諦めた';
    return null;
  },null,{timeout:2000}).then(handle=>handle.jsonValue());
  console.log('合成:',composite);
  await page.screenshot({path:'test-results/04b-impact.png'});
  // 29秒で騎士が構え、30秒から防御の回。左に浮かぶ輪を囲むと盾になる。
  await expect(page.locator('#instruction')).toHaveText('騎士が、剣を構えた',{timeout:12000});
  await expect(page.locator('#act-title')).toBeVisible({timeout:5000});
  await expect(page.locator('#instruction')).toHaveText('左の輪の中に、守る形を描け',{timeout:5000});
  await page.locator('#chant').fill('氷よ、壁となれ、弾き返せ');
  await encircleAim(page);
  await expect(page.locator('#hint')).toContainText('囲えた',{timeout:5000});await page.screenshot({path:'test-results/06-guard-drawn.png'});
  await expect(page.locator('#step-complete')).toHaveClass('active',{timeout:20000});await page.screenshot({path:'test-results/07-shield.png'});
  await expect(page.locator('#step-release')).toHaveClass('active',{timeout:8000});
  await page.waitForTimeout(1600);await page.screenshot({path:'test-results/08-blocked.png'});
  await expect(page.locator('#instruction')).toHaveText('騎士の胸が開いた',{timeout:10000});await page.screenshot({path:'test-results/09-weakpoint.png'});
  // 56秒からとどめの回。弱点へもう一度描いて唱える。
  await expect(page.locator('#instruction')).toHaveText('弱点へ、最後の術式を描け',{timeout:6000});
  await page.locator('#chant').fill('光よ、集まれ、貫け');
  await page.mouse.move(700,430);await page.mouse.down();
  for(let i=0;i<40;i++){await page.mouse.move(700+Math.sin(i/7)*170,430+Math.cos(i/7)*130);await page.waitForTimeout(35);}
  await page.mouse.up();
  await expect(page.locator('#instruction')).toHaveText('全力で詠唱せよ',{timeout:13000});await page.screenshot({path:'test-results/10-finish-drawing.png'});
  await expect(page.locator('#step-release')).toHaveClass('active',{timeout:16000});
  await page.waitForTimeout(2600);await page.screenshot({path:'test-results/11-final-blow.png'});
  // 90秒で結果。魔法名はとどめの回だけ84秒に出るので、そこまで待つ。
  await expect(page.locator('#result')).toBeVisible({timeout:18000});// 見出しの魔法名は、とどめの回のもの。形は描いた線で変わるので、属性までを見る。
  await expect(page.locator('#spell-name')).toContainText('光の');
  await expect(page.locator('#spell-list')).toContainText('7つの雷の連弾');
  await expect(page.locator('#spell-list')).toContainText('とどめ');
  await expect(page.locator('#spell-list')).toContainText('弾き返した');
  // 三件とも術式の絵を出す。
  await expect(page.locator('#spell-list canvas')).toHaveCount(3);
  // 確認番号は6桁。保存の状態の一行も出す。届いていないものを「登録しました」と書かない。
  await expect(page.locator('#confirm-number')).toHaveText(/^\d{6}$/);
  await expect(page.locator('#save-state')).toHaveText('この画面でだけ見られます');
  await expect(page.locator('#qr-slot')).toHaveText('持ち帰りの準備中');
  await expect(page.locator('#spell')).toHaveAttribute('data-visible','false');await expect(page.locator('#result-spell')).toBeVisible();
  await expect(page.locator('#transcript')).toContainText('文字で入力');await page.screenshot({path:'test-results/05-result.png'});
  await page.locator('[data-feedback="yes"]').click();await page.locator('#record').click();
  const record=JSON.parse(await page.locator('#sheet-body pre').innerText());
  // 記録の時刻はどれも戦いの開始からの通し。比べる値は rounds.ts の表から作り、ここに秒数を書かない。
  const first=record.rounds[0],defend=record.rounds[1],finish=record.rounds[2];
  expect(first.rawPoints.length).toBeGreaterThan(50);expect(first.rawPoints.at(-1).t).toBeGreaterThan(ROUNDS[0].inputEnd-1000);expect(first.recipe.count).toBe(7);
  expect(first.events.find((e:{name:string})=>e.name==='recipe-locked').observedMs).toBeLessThan(ROUNDS[0].lock+250);
  expect(defend.rawPoints.filter((p:{t:number})=>p.t>=ROUNDS[1].start&&p.t<ROUNDS[1].inputEnd).length).toBeGreaterThan(20);
  expect(defend.guard.enclosed).toBe(true);expect(defend.guard.style).toBe('reflect');
  expect(defend.guard.rings).toBeGreaterThanOrEqual(1);expect(defend.guard.moved).toBe(false);
  expect(defend.events.find((e:{name:string})=>e.name==='recipe-locked').observedMs).toBeLessThan(ROUNDS[1].lock+250);
  expect(record.scope).toBe('full-90-seconds');expect(record.rounds.length).toBe(3);
  expect(record.confirmCode).toMatch(/^\d{6}$/);
  expect(finish.rawPoints.filter((p:{t:number})=>p.t>=ROUNDS[2].start&&p.t<ROUNDS[2].inputEnd).length).toBeGreaterThan(20);
  expect(finish.events.find((e:{name:string})=>e.name==='recipe-locked').observedMs).toBeLessThan(ROUNDS[2].lock+250);
  expect(record.feedback).toBe('yes');
  // 入力から描き終わるまでの時間も、この通しの記録から見る。
  // 合図が消えたあとに描いているので、測った回数は必ず1回以上になる。
  expect(record.measurement.inputToDrawMs.samples).toBeGreaterThan(0);
  expect(record.measurement.inputToDrawMs.median).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('遅いJevの回答は使わず、本人の氷の壁で時刻どおり発動する',async({page})=>{
  await page.route('**/api/interpret',async route=>{
    const s=route.request().postDataJSON();await new Promise(resolve=>setTimeout(resolve,3000));
    await route.fulfill({json:{sessionId:s.sessionId,castId:s.castId,inputRevision:s.inputRevision,status:'ok',answers:{element:{type:'choice',choice:'fire',probabilities:{fire:1}}}}}).catch(()=>{});
  });
  await page.goto('/?dev=1&flow=together');await page.locator('#start').click();await expect(page.locator('#countdown')).toBeHidden({timeout:15000});await page.locator('#chant').fill('雷ではなく氷よ、壁となれ');
  await expect(page.locator('#step-release')).toHaveClass('active',{timeout:26000});
  await expect(page.locator('#result')).toBeVisible({timeout:76000});
  await expect(page.locator('#spell-list')).toContainText('氷の壁');
  await page.locator('#record').click();const record=JSON.parse(await page.locator('#sheet-body pre').innerText());
  const first=record.rounds[0];
  expect(first.recipe.source).toBe('local');expect(first.recipe.purpose).toBe('defend');expect(first.recipe.assistance).toContain('動きがないため中央の光点を使用');
  // 何も描かなくても、防御は必ず成り立つ。
  expect(record.rounds[1].guard.enclosed).toBe(false);
});

test('カメラの認識を別の処理場所で準備し、中止すると解放する',async({page})=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/?flow=together');await page.locator('input[value="camera"]').check();await page.locator('#start').click();
  await expect(page.locator('#hud')).toBeVisible({timeout:30000});await page.waitForTimeout(1500);await page.locator('#cancel').click();
  await expect(page.locator('#welcome')).toBeVisible();expect(errors).toEqual([]);
});

test('見本は本人の入力と区別され、途中で中止できる',async({page})=>{
  await page.goto('/?flow=together');await page.locator('#demo').click();await expect(page.locator('#demo-tag')).toBeVisible();
  await page.waitForTimeout(1000);await page.locator('#cancel').click();await expect(page.locator('#welcome')).toBeVisible();await expect(page.locator('#hud')).toBeHidden();
});

test('Jevの期限内の回答で曖昧な言葉を反映し、発動時刻は早めない',async({page})=>{
  let requested=false;
  await page.route('**/api/interpret',async route=>{
    requested=true;const s=route.request().postDataJSON();
    if(s.castId==='cast-01')expect(s.speech.rawTranscript).toBe('冬の静けさよ、前に立て');
    await route.fulfill({json:{sessionId:s.sessionId,castId:s.castId,inputRevision:s.inputRevision,status:'ok',model:'browser-test',answers:{
      element:{type:'choice',choice:'ice',probabilities:{ice:.9,unknown:.1}},form:{type:'choice',choice:'wall',probabilities:{wall:.9,orb:.1}},purpose:{type:'choice',choice:'defend',probabilities:{defend:.9,unknown:.1}},
    }}});
  });
  await page.goto('/?dev=1&flow=together');await page.locator('#start').click();await expect(page.locator('#countdown')).toBeHidden({timeout:15000});await page.locator('#chant').fill('冬の静けさよ、前に立て');
  await expect(page.locator('#recognized')).toBeVisible({timeout:24000});await expect(page.locator('#step-complete')).toHaveClass('active');
  await expect(page.locator('#result')).toBeVisible({timeout:78000});
  await expect(page.locator('#spell-list')).toContainText('氷の壁');
  await page.locator('#record').click();const record=JSON.parse(await page.locator('#sheet-body pre').innerText());
  const first=record.rounds[0];
  expect(requested).toBe(true);expect(first.recipe.decisions.element.source).toBe('jev');expect(first.recipe.model).toBe('browser-test');
  expect(first.events.find((e:{name:string})=>e.name==='release').observedMs).toBeGreaterThanOrEqual(ROUNDS[0].release);
});
