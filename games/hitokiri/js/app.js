import {add,sub,mul,dot,basis,normal,vertices,faces,edges,cubeSection,sphereSection,coneSection,evaluateGoal} from './geometry.js';
const $=id=>document.getElementById(id),scene=$('scene'),ctx=scene.getContext('2d');
const modes=['cube','sphere','cone'];let mode='cube',cut=false,measured=null,yaw=-.65,pitch=.42,drag=null;
const configs={cube:{headline:'五角形、切れる？',subtitle:'立方体をひと切り。断面を五角形にして、面積 0.800 を狙おう。',label:'一辺 1 の立方体',min:-.86,max:.86,start:.08},sphere:{headline:'ちょうど半分、切れる？',subtitle:'半径1の球をひと切り。断面積・周長・体積の50%を狙おう。',label:'半径 1 の球',min:-1,max:1,start:.25},cone:{headline:'半分って、どの高さ？',subtitle:'円錐を底面と平行にひと切り。断面積・周長・体積の50%を狙おう。',label:'底面半径 1・高さ 1 の円錐 / 平行切断',min:0,max:1,start:.5}};
function urlMode(){const m=new URL(location.href).searchParams.get('mode');return modes.includes(m)?m:'cube';}
function setMode(next,updateURL=false){mode=next;cut=false;measured=null;const c=configs[mode];
  if(updateURL){const u=new URL(location.href);u.searchParams.set('mode',mode);history.pushState({},'',u);}
  document.querySelectorAll('[data-mode]').forEach(b=>{b.classList.toggle('active',b.dataset.mode===mode);b.setAttribute('aria-pressed',String(b.dataset.mode===mode));});
  $('headline').textContent=c.headline;$('subtitle').textContent=c.subtitle;$('solid-label').textContent=c.label;
  $('chapter').textContent={cube:'01 / CUBE',sphere:'02 / SPHERE',cone:'03 / CONE'}[mode];
  document.title=`ひと切り — ${c.headline}`;$('angles').hidden=mode!=='cube';$('metric-picker').hidden=mode==='cube';
  $('offset').min=c.min;$('offset').max=c.max;$('offset').value=c.start;$('azimuth').value=35;$('elevation').value=28;
  $('offset-label').textContent=mode==='cone'?'底面からの高さ':'中心からの位置';
  $('result').hidden=true;updateMission();sync();
}
function updateMission(){const metric=$('metric').value;
  $('mission-title').textContent=mode==='cube'?'五角形 × 面積 0.800':{area:'断面積を最大の50%に',perimeter:'周長を最大の50%に',volume:'片側の体積を50%に'}[metric];
  $('mission-note').textContent=mode==='cube'?'辺の数は5本。面積は ±0.025 で成功。':metric==='volume'?(mode==='cone'?'頂点側の体積を測定。目標50% ±2ポイント。':'平面より下側の体積を測定。目標50% ±2ポイント。'):(metric==='area'?'最大断面積 π を基準に、50% ±2ポイント。':'最大周長 2π を基準に、50% ±2ポイント。');
}
function parameters(){return {n:mode==='cube'?normal(+$('azimuth').value,+$('elevation').value):[0,1,0],d:+$('offset').value};}
function measurement(){const {n,d}=parameters();if(mode==='cube')return cubeSection(n,d);return mode==='sphere'?sphereSection(d):coneSection(d);}
function sync(){cut=false;measured=null;$('result').hidden=true;$('preview-label').textContent='切断前';$('copy-status').textContent='';
  $('azimuth-out').textContent=`${(+$('azimuth').value).toFixed(1)}°`;$('elevation-out').textContent=`${(+$('elevation').value).toFixed(1)}°`;$('offset-out').textContent=(+$('offset').value).toFixed(3);draw();
}
function performCut(){cut=true;measured=measurement();$('preview-label').textContent='切断済み';const m=measured,goal=evaluateGoal(mode,m,$('metric').value);
  $('result').hidden=false;$('result-status').textContent=goal.success?'ぴったり。お見事！':mode==='cube'&&m.sides!==5?(m.sides?`${m.sides}角形でした。`:'立方体を通る位置で切ろう。'):'あと、ひと切り。';
  const rows=[['断面積',m.area.toFixed(4)],['周長',m.perimeter.toFixed(4)],['体積',m.volume.toFixed(4)],['体積比',`${(100*m.volume/(m.total||1)).toFixed(2)}%`]];
  if(mode==='cube')rows.unshift(['辺の数',`${m.sides} 本`]);
  if(mode==='cube')rows.push(['辺のばらつき',m.sides?`${(100*m.cv).toFixed(2)}%`:'—']);
  $('measurements').replaceChildren(...rows.map(([label,value])=>{const row=document.createElement('div'),a=document.createElement('span'),b=document.createElement('b');a.textContent=label;b.textContent=value;row.append(a,b);return row;}));
  const delta=m.area-.8;
  $('feedback').textContent=mode==='cube'?(m.sides===5?`五角形！ 面積は目標より ${Math.abs(delta).toFixed(4)} ${delta>=0?'大きい':'小さい'}。`:'向きと位置を少しずつ変えて、5本の辺を探そう。')+' 体積は青い断面の下側（法線と逆側）。辺のばらつきは標準偏差÷平均辺長。':`目標との差 ${Math.abs((goal.value-.5)*100).toFixed(2)} ポイント。${mode==='cone'?'体積は頂点側の小円錐。':'体積は平面より下側。'}`;
  draw();drawSection();
}
function canvasSize(canvas){const r=canvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(r.width*dpr);canvas.height=Math.round(r.height*dpr);const c=canvas.getContext('2d');c.setTransform(dpr,0,0,dpr,0,0);return {c,w:r.width,h:r.height};}
function camera(p){const x=p[0]*Math.cos(yaw)+p[2]*Math.sin(yaw),z=-p[0]*Math.sin(yaw)+p[2]*Math.cos(yaw);return [x,p[1]*Math.cos(pitch)-z*Math.sin(pitch),p[1]*Math.sin(pitch)+z*Math.cos(pitch)];}
function draw(){const {c,w,h}=canvasSize(scene),size=Math.min(w*.52,h*.60)/(mode==='cube'?1:1.9),project=p=>{const q=camera(p);return [w/2+q[0]*size,h*.53-q[1]*size,q[2]];};
  c.clearRect(0,0,w,h);
  const polygon=(ps,fill,stroke,width=1)=>{if(!ps.length)return;c.beginPath();ps.forEach((p,i)=>{const q=project(p);i?c.lineTo(q[0],q[1]):c.moveTo(q[0],q[1]);});c.closePath();if(fill){c.fillStyle=fill;c.fill();}if(stroke){c.strokeStyle=stroke;c.lineWidth=width;c.stroke();}};
  // 静かな地面のグリッド。
  c.strokeStyle='#d9dfd0';c.lineWidth=.6;for(let i=-5;i<=5;i++){for(const axis of [0,2]){const a=[-1.3,-.78,-1.3],b=[1.3,-.78,1.3];a[axis]=b[axis]=i*.26;const p=project(a),q=project(b);c.beginPath();c.moveTo(p[0],p[1]);c.lineTo(q[0],q[1]);c.stroke();}}
  const {n,d}=parameters(),m=measured||measurement();let polys=[];
  if(mode==='cube')polys=(cut?m.clipped:faces.map(f=>f.map(i=>vertices[i]))).map((p,i)=>({p,color:['#9aaf8170','#e9efcf90','#bfce9a90','#e5eccb90','#c4d2ab90','#d4dfb790'][i%6]}));
  else if(mode==='sphere'){
    const segments=40,rings=22;for(let j=0;j<rings;j++)for(let i=0;i<segments;i++){
      const p=(u,v)=>{const a=2*Math.PI*u/segments,b=-Math.PI/2+Math.PI*v/rings;return [Math.cos(b)*Math.cos(a),Math.sin(b),Math.cos(b)*Math.sin(a)];};
      const ps=[p(i,j),p(i+1,j),p(i+1,j+1),p(i,j+1)],visible=[];
      // 境界を横切る描画ポリゴンを補間して切り、断面との隙間を防ぐ。
      if(cut){for(let k=0;k<ps.length;k++){const a=ps[k],b=ps[(k+1)%ps.length];if(a[1]<=d)visible.push(a);if((a[1]<d&&b[1]>d)||(a[1]>d&&b[1]<d))visible.push(add(a,mul(sub(b,a),(d-a[1])/(b[1]-a[1]))));}}
      const surface=cut?visible:ps;if(surface.length>=3)polys.push({p:surface,color:`rgba(166,186,133,${cut?.65:.20})`});
    }
  }else{const ring=Array.from({length:64},(_,i)=>[Math.cos(i/64*2*Math.PI),-.5,Math.sin(i/64*2*Math.PI)]),top=[0,.5,0];
    const base=cut?ring.map(p=>[p[0]*(1-d),d-.5,p[2]*(1-d)]):ring;
    for(let i=0;i<64;i++)polys.push({p:[top,base[i],base[(i+1)%64]],color:'#bccd9d80'});
    polys.push({p:base,color:'#a7bc8a70'});
  }
  polys.sort((a,b)=>a.p.reduce((s,p)=>s+camera(p)[2],0)/a.p.length-b.p.reduce((s,p)=>s+camera(p)[2],0)/b.p.length);
  for(const {p,color} of polys)polygon(p,color,mode==='cube'?'#6f886b85':null);
  if(mode==='cube'){
    c.setLineDash([4,5]);for(const [i,j] of edges){const a=project(vertices[i]),b=project(vertices[j]);c.beginPath();c.moveTo(a[0],a[1]);c.lineTo(b[0],b[1]);c.strokeStyle='#6d846970';c.lineWidth=1;c.stroke();}c.setLineDash([]);
  }
  const center=mul(n,mode==='cone'?d-.5:d),[u,v]=basis(n),planeSize=mode==='cube'?.8:1.2;
  if(!cut)polygon([[-1,-1],[1,-1],[1,1],[-1,1]].map(([x,y])=>add(center,add(mul(u,x*planeSize),mul(v,y*planeSize)))),'#61a9be12','#6a9faa65');
  const points=mode==='cube'?m.points:Array.from({length:96},(_,i)=>add(center,add(mul(u,m.radius*Math.cos(i/96*Math.PI*2)),mul(v,m.radius*Math.sin(i/96*Math.PI*2)))));
  polygon(points,cut?'#3186a359':'#5ba6bc25','#287f9c',2.4);
  if(mode==='cube')for(const p of points){const q=project(p);c.beginPath();c.arc(q[0],q[1],3.5,0,Math.PI*2);c.fillStyle='#267f9b';c.fill();}
  c.font='10px sans-serif';c.fillStyle='#71806c';c.fillText(mode==='cube'?'CUBE / 1 × 1 × 1':mode==='sphere'?'SPHERE / r = 1':'CONE / r = 1, h = 1',22,h-45);
}
function drawSection(){if(!measured)return;const {c,w,h}=canvasSize($('section')),m=measured;
  let ps;if(mode==='cube'){const [u,v]=basis(parameters().n);ps=m.points.map(p=>[dot(p,u),dot(p,v)]);}else ps=Array.from({length:80},(_,i)=>[m.radius*Math.cos(i/80*Math.PI*2),m.radius*Math.sin(i/80*Math.PI*2)]);
  c.clearRect(0,0,w,h);if(!ps.length)return;
  const xs=ps.map(p=>p[0]),ys=ps.map(p=>p[1]),cx=(Math.min(...xs)+Math.max(...xs))/2,cy=(Math.min(...ys)+Math.max(...ys))/2,scale=Math.min(w-30,h-30)/Math.max(Math.max(...xs)-Math.min(...xs),Math.max(...ys)-Math.min(...ys),.1);
  c.beginPath();ps.forEach((p,i)=>{const x=w/2+(p[0]-cx)*scale,y=h/2-(p[1]-cy)*scale;i?c.lineTo(x,y):c.moveTo(x,y);});c.closePath();c.fillStyle='#d6e5ce';c.fill();c.strokeStyle='#3286a3';c.lineWidth=2;c.stroke();
}
document.querySelectorAll('[data-mode]').forEach(b=>b.addEventListener('click',()=>setMode(b.dataset.mode,true)));
['azimuth','elevation','offset'].forEach(id=>$(id).addEventListener('input',sync));
$('metric').addEventListener('change',()=>{updateMission();sync();});$('cut').addEventListener('click',performCut);$('reset').addEventListener('click',()=>setMode(mode));
$('view-reset').addEventListener('click',()=>{yaw=-.65;pitch=.42;draw();});
$('help').addEventListener('click',()=>$('help-dialog').showModal());$('close-help').addEventListener('click',()=>$('help-dialog').close());
scene.addEventListener('pointerdown',e=>{drag=[e.clientX,e.clientY];scene.setPointerCapture(e.pointerId);});
scene.addEventListener('pointermove',e=>{if(!drag)return;yaw+=(e.clientX-drag[0])*.009;pitch=Math.max(-1.2,Math.min(1.2,pitch+(e.clientY-drag[1])*.009));drag=[e.clientX,e.clientY];draw();});
scene.addEventListener('pointerup',()=>drag=null);scene.addEventListener('pointercancel',()=>drag=null);
$('share').addEventListener('click',async()=>{if(!measured)return;const m=measured,u=new URL(location.href);u.searchParams.set('mode',mode);
  const text=`ひと切り｜${mode==='cube'?`${m.sides}角形、面積 ${m.area.toFixed(4)}（目標 0.800）`:`${$('mission-title').textContent}：${(evaluateGoal(mode,m,$('metric').value).value*100).toFixed(2)}%`}\n${u.href}`;
  try{await navigator.clipboard.writeText(text);$('copy-status').textContent='コピーしました';}catch{$('copy-status').textContent='コピーできませんでした';}
});
window.addEventListener('popstate',()=>setMode(urlMode()));
new ResizeObserver(()=>{draw();if(cut)drawSection();}).observe(scene);
setMode(urlMode());
