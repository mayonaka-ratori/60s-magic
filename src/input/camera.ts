export class HandCamera {
  private worker:Worker|null=null;
  private stream:MediaStream|null=null;
  private video=document.createElement('video');
  private running=false;
  private busy=false;
  private previous:Array<{x:number;y:number;id:number;t:number}>=[];
  private frame=0;
  private lastFrameTime=-1;
  latencyMs=0;
  constructor(private onHands:(hands:Array<{x:number;y:number;id:number}>,timestamp:number)=>void,private onError:(message:string)=>void) {}
  async prepare() {
    try {
      this.stream=await navigator.mediaDevices.getUserMedia({video:{width:{ideal:640},height:{ideal:480},frameRate:{ideal:30,max:30}},audio:false});
      this.video.srcObject=this.stream;this.video.muted=true;this.video.playsInline=true;
      await this.video.play();
      this.worker=new Worker('/hand-worker.js');
      await new Promise<void>((resolve,reject)=>{
        const timeout=setTimeout(()=>reject(new Error('手の認識の準備が時間内に終わりませんでした')),20000);
        this.worker!.onmessage=({data})=>{clearTimeout(timeout);if(data.type==='ready')resolve();else reject(new Error('手の認識を準備できませんでした'));};
        this.worker!.onerror=()=>{clearTimeout(timeout);reject(new Error('手の認識を読み込めませんでした'));};
        this.worker!.postMessage({type:'init'});
      });
      this.worker.onmessage=({data})=>{
        this.busy=false;
        if(data.type!=='hands'){this.onError('手の認識が止まりました');return;}
        this.latencyMs=performance.now()-data.timestamp;
        const available=this.previous.filter(p=>data.timestamp-p.t<800);
        const assigned:Array<{x:number;y:number;id:number;t:number}>=[];
        // 二つの候補の近さを全体で比較し、左右のラベルの揺れで筆を入れ替えない。
        const pairs=data.palms.flatMap((p:{x:number;y:number},i:number)=>available.map(a=>({i,a,d:Math.hypot(p.x-a.x,p.y-a.y)}))).sort((a:{d:number},b:{d:number})=>a.d-b.d);
        const identities=new Map<number,number>(),used=new Set<number>();
        for(const pair of pairs)if(!identities.has(pair.i)&&!used.has(pair.a.id)&&pair.d<0.35){identities.set(pair.i,pair.a.id);used.add(pair.a.id);}
        data.palms.forEach((p:{x:number;y:number},i:number)=>{
          const id=identities.get(i)??([0,1].find(id=>!used.has(id))??i);used.add(id);
          assigned.push({...p,id,t:data.timestamp});
        });
        this.previous=assigned;
        this.onHands(assigned,data.timestamp);
      };
      this.running=true;this.capture();
    } catch(error) {this.dispose();throw error;}
  }
  private capture=()=>{
    if(!this.running)return;
    this.frame=requestAnimationFrame(this.capture);
    if(this.busy||this.video.readyState<2||this.video.currentTime===this.lastFrameTime)return;
    this.lastFrameTime=this.video.currentTime;this.busy=true;
    const timestamp=performance.now();
    void createImageBitmap(this.video).then(bitmap=>{
      if(!this.running){bitmap.close();return;}
      this.worker?.postMessage({type:'frame',bitmap,timestamp},[bitmap]);
    }).catch(()=>{this.busy=false;this.onError('カメラの画像を取り込めませんでした');});
  };
  dispose() {this.running=false;cancelAnimationFrame(this.frame);this.worker?.terminate();this.worker=null;this.stream?.getTracks().forEach(t=>t.stop());this.stream=null;this.video.srcObject=null;this.previous=[];}
}
