import {add,sub,mul,dot,basis,normal,vertices,faces,edges,cubeSection,sphereSection,coneSection,CONE_HEIGHT,evaluateGoal} from './geometry.js';
const $=id=>document.getElementById(id),scene=$('scene'),ctx=scene.getContext('2d');
const modes=['cube','sphere','cone'];let mode='cube',cut=false,measured=null,yaw=-.65,pitch=.42,drag=null;
let detail=false,phase='ready',frame=0,measureTimer=0,startTime=0,score=0,cardURL='',cardFile=null;
let cutProgress=0,cubeStep=0,motionPhase=0,motionMin=0,motionMax=1;
const BAR_PERIOD_MS=7000; // 全バー共通の往復時間
const cubeSteps=['azimuth','elevation','offset'];
const cubeStepNames=['向き','傾き','位置'];
const isAction=()=>!detail;
const goalMetric=()=>mode==='sphere'?'area':'volume';
const pointsFor=m=>mode==='cube'?(m.sides===5?Math.min(100,Math.round(100*m.area/Math.SQRT2)):0):Math.max(0,Math.round(100-200*Math.abs(actionRatio(m)-.5)));
const actionTitle=()=>mode==='cube'?'断面を大きい五角形に':mode==='sphere'?'面積を半分に':'体積を半分に';
const actionRatio=m=>mode==='sphere'?m.area/Math.PI:m.volume/m.total;
const actionValue=m=>mode==='cube'?m.sides?`${m.sides}角形 / 断面積 ${m.area.toFixed(4)}`:'立方体を通る位置を狙おう':`${mode==='sphere'?'断面積':'頂点側の体積'} ${(100*actionRatio(m)).toFixed(2)}% / 目標 50%`;
const configs={cube:{headline:'五角形、切れる？',subtitle:'五角形を作り、断面を大きくしよう。',label:'一辺 1 の立方体',min:-.86,max:.86,start:.08},sphere:{headline:'ちょうど半分、切れる？',subtitle:'半径1の球をひと切り。断面積・周長・体積の50%を狙おう。',label:'半径 1 の球',min:-1,max:1,start:.25},cone:{headline:'半分って、どの高さ？',subtitle:'円錐を底面と平行にひと切り。断面積・周長・体積の50%を狙おう。',label:'底面半径 1・高さ √3 の円錐 / 平行切断',min:0,max:CONE_HEIGHT,start:CONE_HEIGHT/2}};
function urlMode(){const m=new URL(location.href).searchParams.get('mode');return modes.includes(m)?m:'cube';}
function setMode(next,updateURL=false){cancelAnimationFrame(frame);clearTimeout(measureTimer);phase='ready';cubeStep=0;cutProgress=0;mode=next;cut=false;measured=null;const c=configs[mode];
  if(updateURL){const u=new URL(location.href);u.searchParams.set('mode',mode);history.pushState({},'',u);}
  document.querySelectorAll('[data-mode]').forEach(b=>{b.classList.toggle('active',b.dataset.mode===mode);b.setAttribute('aria-pressed',String(b.dataset.mode===mode));});
  $('headline').textContent=c.headline;$('subtitle').textContent=c.subtitle;$('solid-label').textContent=c.label;
  $('chapter').textContent={cube:'01 / CUBE',sphere:'02 / SPHERE',cone:'03 / CONE'}[mode];
  document.title=`ひと切り — ${c.headline}`;$('angles').hidden=mode!=='cube';$('angle-readouts').hidden=mode!=='cube';
  $('offset').min=c.min;$('offset').max=c.max;$('offset').step=mode==='cone'?'any':'0.001';$('offset').value=c.start;$('height-marker').style.left=`${(c.start-c.min)/(c.max-c.min)*100}%`;$('azimuth').value=35;$('elevation').value=28;if(mode==='cube'&&isAction()){$('azimuth').value=15+Math.random()*150;$('elevation').value=-60+Math.random()*120;$('offset').value=-.25+Math.random()*.5;}
  $('offset-label').textContent=mode==='cone'?'底面からの高さ':'中心からの位置';
  $('result').hidden=true;updateMission();updatePlayUI();sync();
}
function updateMission(){
  $('mission-title').textContent=mode==='cube'?'断面を大きい五角形に':actionTitle();
  $('mission-note').textContent=mode==='cube'?'五角形の断面積で採点。√2を100点の基準にします。':mode==='sphere'?'最大断面積 π の50%に。':'頂点側の小円錐を全体の50%に。';
}
function parameters(){return {n:mode==='cube'?normal(+$('azimuth').value,+$('elevation').value):[0,1,0],d:+$('offset').value};}
function measurement(){const {n,d}=parameters();if(mode==='cube')return cubeSection(n,d);return mode==='sphere'?sphereSection(d):coneSection(d);}
function sync(){$('share').disabled=true;cutProgress=0;cut=false;measured=null;cardFile=null;$('result').hidden=true;$('download-card').hidden=true;$('share-fallback').hidden=true;$('preview-label').textContent='切断前';$('copy-status').textContent='';
  $('azimuth-out').textContent=`${(+$('azimuth').value).toFixed(3)}°`;$('elevation-out').textContent=`${(+$('elevation').value).toFixed(3)}°`;$('offset-out').textContent=(+$('offset').value).toFixed(3);if(!isAction())performCut(true);else draw();
}
function performCut(live=false){$('share').disabled=false;cut=!live;measured=measurement();$('preview-label').textContent='切断済み';const m=measured,goal=mode==='cube'?{success:pointsFor(m)===100}:evaluateGoal(mode,m,goalMetric());
  $('result').hidden=false;$('result-status').textContent=goal.success?'ぴったり。お見事！':mode==='cube'&&m.sides!==5?(m.sides?`${m.sides}角形でした。`:'立方体を通る位置で切ろう。'):'あと、ひと切り。';
  const rows=[['断面積',m.area.toFixed(4)],[mode==='cube'?'周長':'円周',m.perimeter.toFixed(4)],['体積',m.volume.toFixed(4)],['体積比',`${(100*m.volume/(m.total||1)).toFixed(2)}%`]];
  if(mode==='cube')rows.unshift(['辺の数',`${m.sides} 本`]);
  if(mode==='cube')rows.push(['辺のばらつき',m.sides?`${(100*m.cv).toFixed(2)}%`:'—']);
  $('measurements').replaceChildren(...rows.map(([label,value])=>{const row=document.createElement('div'),a=document.createElement('span'),b=document.createElement('b');a.textContent=label;b.textContent=value;row.append(a,b);return row;}));
  $('feedback').textContent=mode==='cube'?(m.sides===5?`断面積 ${m.area.toFixed(4)}。上限 √2（約1.4142）を目指そう。`:'5本の辺を持つ断面を探そう。')+' 体積は法線と逆側。ばらつきは標準偏差÷平均辺長。':`目標との差 ${Math.abs((goal.value-.5)*100).toFixed(2)} ポイント。${mode==='cone'?'体積は頂点側の小円錐。':'体積は平面より下側。'}`;
  score=pointsFor(m);$('score').textContent=score+'点';$('score').hidden=false;
  const inputs=mode==='cube'?[['向き',`${(+$('azimuth').value).toFixed(3)}°`],['傾き',`${(+$('elevation').value).toFixed(3)}°`],['位置',(+$('offset').value).toFixed(3)]]:[[mode==='cone'?'底面からの高さ':'中心からの位置',(+$('offset').value).toFixed(3)]];
  $('result-values').replaceChildren(...inputs.map(([label,value])=>{const item=document.createElement('div'),term=document.createElement('dt'),definition=document.createElement('dd');term.textContent=label;definition.textContent=value;item.append(term,definition);return item;}));$('result-values').hidden=!isAction();

  if(isAction()){$('score').textContent=score+'点';$('result-status').textContent=score===100?'神業の、ひと切り。':score>=90?'お見事！':score>=70?'いい切れ味！':'もう一度、狙ってみよう。';$('feedback').textContent=actionValue(m);phase='result';updatePlayUI();}
  draw();drawSection();if(isAction())createCard();
}
function canvasSize(canvas){const r=canvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(r.width*dpr);canvas.height=Math.round(r.height*dpr);const c=canvas.getContext('2d');c.setTransform(dpr,0,0,dpr,0,0);return {c,w:r.width,h:r.height};}
function camera(p){const x=p[0]*Math.cos(yaw)+p[2]*Math.sin(yaw),z=-p[0]*Math.sin(yaw)+p[2]*Math.cos(yaw);return [x,p[1]*Math.cos(pitch)-z*Math.sin(pitch),p[1]*Math.sin(pitch)+z*Math.cos(pitch)];}
function draw(){const {c,w,h}=canvasSize(scene),size=Math.min(w*.52,h*.60)/(mode==='cube'?1:1.9),project=p=>{const q=camera(p);return [w/2+q[0]*size,h*.53-q[1]*size,q[2]];};
  c.clearRect(0,0,w,h);
  const polygon=(ps,fill,stroke,width=1)=>{if(!ps.length)return;c.beginPath();ps.forEach((p,i)=>{const q=project(p);i?c.lineTo(q[0],q[1]):c.moveTo(q[0],q[1]);});c.closePath();if(fill){c.fillStyle=fill;c.fill();}if(stroke){c.strokeStyle=stroke;c.lineWidth=width;c.stroke();}};
  // 静かな地面のグリッド。
  if(!isAction()){c.strokeStyle='#d5d5d5';c.lineWidth=.6;for(let i=-5;i<=5;i++){for(const axis of [0,2]){const a=[-1.3,-.78,-1.3],b=[1.3,-.78,1.3];a[axis]=b[axis]=i*.26;const p=project(a),q=project(b);c.beginPath();c.moveTo(p[0],p[1]);c.lineTo(q[0],q[1]);c.stroke();}}
  }
  const {n,d}=parameters(),m=measured||measurement(),gap=cut?(mode==='cube'?.22:.38)*(isAction()?cutProgress:1):0;let polys=[];
  if(mode==='cube'){const part=ps=>ps.map(p=>sub(p,mul(n,gap*.5)));polys=(cut?m.clipped.map(part):faces.map(f=>f.map(i=>vertices[i]))).map((p,i)=>({p,color:['#a4a4a470','#e8e8e890','#cccccc90','#dfdfdf90','#c8c8c890','#d2d2d290'][i%6]}));if(cut){const other=cubeSection(mul(n,-1),-d);polys.push(...other.clipped.map(p=>({p:p.map(v=>add(v,mul(n,gap))),color:'#bbbbbb80'})));}}
  else if(mode==='sphere'){
    const segments=40,rings=22;for(let j=0;j<rings;j++)for(let i=0;i<segments;i++){
      const p=(u,v)=>{const a=2*Math.PI*u/segments,b=-Math.PI/2+Math.PI*v/rings;return [Math.cos(b)*Math.cos(a),Math.sin(b),Math.cos(b)*Math.sin(a)];};
      const ps=[p(i,j),p(i+1,j),p(i+1,j+1),p(i,j+1)];
      const clipped=side=>{const out=[];for(let k=0;k<ps.length;k++){const a=ps[k],b=ps[(k+1)%ps.length];if(side*(a[1]-d)>=0)out.push(a);if((a[1]<d&&b[1]>d)||(a[1]>d&&b[1]<d))out.push(add(a,mul(sub(b,a),(d-a[1])/(b[1]-a[1]))));}return out;};
      if(cut){for(const side of [-1,1]){const surface=clipped(side).map(p=>[p[0],p[1]+(side===1?gap:-gap*.5),p[2]]);if(surface.length>=3)polys.push({p:surface,color:'rgba(160,160,160,.35)'});}}
      else polys.push({p:ps,color:'rgba(160,160,160,.20)'});
    }
  }else{const ring=Array.from({length:64},(_,i)=>[Math.cos(i/64*2*Math.PI),-CONE_HEIGHT/2,Math.sin(i/64*2*Math.PI)]),top=[0,CONE_HEIGHT/2+gap,0];
    const base=cut?ring.map(p=>[p[0]*(1-d/CONE_HEIGHT),d-CONE_HEIGHT/2+gap,p[2]*(1-d/CONE_HEIGHT)]):ring;
    for(let i=0;i<64;i++)polys.push({p:[top,base[i],base[(i+1)%64]],color:'#bbbbbb80'});
    polys.push({p:base,color:'#ababab70'});
    if(cut){const bottom=ring.map(p=>[p[0],p[1]-gap*.5,p[2]]),rim=ring.map(p=>[p[0]*(1-d/CONE_HEIGHT),d-CONE_HEIGHT/2-gap*.5,p[2]*(1-d/CONE_HEIGHT)]);
      for(let i=0;i<64;i++)polys.push({p:[bottom[i],bottom[(i+1)%64],rim[(i+1)%64],rim[i]],color:'#b7b7b780'});
      polys.push({p:bottom,color:'#99999960'});polys.push({p:rim,color:'#247ad650'});
    }
  }
  polys.sort((a,b)=>a.p.reduce((s,p)=>s+camera(p)[2],0)/a.p.length-b.p.reduce((s,p)=>s+camera(p)[2],0)/b.p.length);
  for(const {p,color} of polys)polygon(p,color,mode==='cube'?'#78787885':null);
  if(mode==='cube'){
    c.setLineDash([4,5]);for(const [i,j] of edges){const a=project(vertices[i]),b=project(vertices[j]);c.beginPath();c.moveTo(a[0],a[1]);c.lineTo(b[0],b[1]);c.strokeStyle='#88888870';c.lineWidth=1;c.stroke();}c.setLineDash([]);
  }
  const center=mul(n,mode==='cone'?d-CONE_HEIGHT/2+gap:mode==='sphere'?d+gap:d),[u,v]=basis(n),planeSize=mode==='cube'?.8:1.2;
  if(!cut)polygon([[-1,-1],[1,-1],[1,1],[-1,1]].map(([x,y])=>add(center,add(mul(u,x*planeSize),mul(v,y*planeSize)))),'#76b4e112','#679ec965');
  const points=mode==='cube'?m.points.map(p=>sub(p,mul(n,gap*.5))):Array.from({length:96},(_,i)=>add(center,add(mul(u,m.radius*Math.cos(i/96*Math.PI*2)),mul(v,m.radius*Math.sin(i/96*Math.PI*2)))));
  polygon(points,cut?'#247ad659':'#68a7d425','#247ad6',2.4);
  if(mode==='cube'&&cut)polygon(m.points.map(p=>add(p,mul(n,gap))),'#247ad630','#247ad6',2);
  if(mode==='cone'){
    const ring=Array.from({length:96},(_,i)=>[Math.cos(i/96*Math.PI*2),-CONE_HEIGHT/2-gap*.5,Math.sin(i/96*Math.PI*2)]);
    polygon(ring,'#99999920','#939393',1.5);
    const line=(a,b,color,dash=[])=>{const p=project(a),q=project(b);c.beginPath();c.setLineDash(dash);c.moveTo(p[0],p[1]);c.lineTo(q[0],q[1]);c.strokeStyle=color;c.lineWidth=1.7;c.stroke();c.setLineDash([]);};
    const bottom=[0,-CONE_HEIGHT/2-gap*.5,0],top=[0,CONE_HEIGHT/2+gap,0];
    if(cut){line(bottom,[0,d-CONE_HEIGHT/2-gap*.5,0],'#777777',[4,4]);line([0,d-CONE_HEIGHT/2+gap,0],top,'#777777',[4,4]);
      polygon(points.map(p=>[p[0],p[1]-gap*1.5,p[2]]),'#247ad630','#247ad6',2);
    }else line(bottom,top,'#777777',[4,4]);
    for(const p of [bottom,top]){const q=project(p);c.beginPath();c.arc(q[0],q[1],3,0,Math.PI*2);c.fillStyle='#555555';c.fill();}
  }
  if(mode==='sphere'){
    // 球に底面はないため、中心を通る最大断面を基準円として表示。
    const moveY=y=>y+(cut?(y>d?gap:-gap*.5):0);
    const equator=Array.from({length:96},(_,i)=>[Math.cos(i/96*Math.PI*2),moveY(0),Math.sin(i/96*Math.PI*2)]);
    polygon(equator,'#99999912','#939393',1.3);
    const axis=(a,b)=>{const p=project([0,a,0]),q=project([0,b,0]);c.beginPath();c.setLineDash([4,4]);c.moveTo(p[0],p[1]);c.lineTo(q[0],q[1]);c.strokeStyle='#777777';c.lineWidth=1.7;c.stroke();c.setLineDash([]);};
    if(cut){axis(-1-gap*.5,d-gap*.5);axis(d+gap,1+gap);polygon(points.map(p=>[p[0],p[1]-gap*1.5,p[2]]),'#247ad630','#247ad6',2);}
    else axis(-1,1);
    for(const y of [-1,0,1]){const p=project([0,moveY(y),0]);c.beginPath();c.arc(p[0],p[1],y===0?3.5:2.5,0,Math.PI*2);c.fillStyle='#555555';c.fill();}
  }
  if(isAction()&&phase==='measuring'){
    const t=Math.min(1,(performance.now()-startTime)/300),x=w*(.08+.84*t),cy=project([0,mode==='cone'?d-CONE_HEIGHT/2:d,0])[1];
    c.save();c.shadowColor='#ffffff';c.shadowBlur=16;c.strokeStyle='#fff';c.lineWidth=4;c.beginPath();c.moveTo(x-35,cy+15);c.lineTo(x+35,cy-15);c.stroke();c.restore();
  }
  if(mode==='cube')for(const p of points){const q=project(p);c.beginPath();c.arc(q[0],q[1],3.5,0,Math.PI*2);c.fillStyle='#247ad6';c.fill();}
  c.font='10px sans-serif';c.fillStyle='#888888';// 寸法の説明は遊び方で確認。
}
function drawSection(){if(!measured)return;const {c,w,h}=canvasSize($('section')),m=measured;
  let ps;if(mode==='cube'){const [u,v]=basis(parameters().n);ps=m.points.map(p=>[dot(p,u),dot(p,v)]);}else ps=Array.from({length:80},(_,i)=>[m.radius*Math.cos(i/80*Math.PI*2),m.radius*Math.sin(i/80*Math.PI*2)]);
  c.clearRect(0,0,w,h);if(!ps.length)return;
  const xs=ps.map(p=>p[0]),ys=ps.map(p=>p[1]),cx=(Math.min(...xs)+Math.max(...xs))/2,cy=(Math.min(...ys)+Math.max(...ys))/2,scale=Math.min(w-30,h-30)/Math.max(Math.max(...xs)-Math.min(...xs),Math.max(...ys)-Math.min(...ys),.1);
  c.beginPath();ps.forEach((p,i)=>{const x=w/2+(p[0]-cx)*scale,y=h/2-(p[1]-cy)*scale;i?c.lineTo(x,y):c.moveTo(x,y);});c.closePath();c.fillStyle='#dddddd';c.fill();c.strokeStyle='#247ad6';c.lineWidth=2;c.stroke();
}
document.querySelectorAll('[data-mode]').forEach(b=>b.addEventListener('click',()=>setMode(b.dataset.mode,true)));
['azimuth','elevation','offset'].forEach(id=>$(id).addEventListener('input',sync));
// rangeのブラウザー既定動作を置き換え、全図形で同じ刻みにする。
for(const id of cubeSteps)$(id).addEventListener('keydown',event=>{
  const increments={ArrowRight:.001,ArrowLeft:-.001,ArrowUp:.1,ArrowDown:-.1};
  if(!(event.key in increments)||isAction()||event.currentTarget.disabled)return;
  event.preventDefault();const input=event.currentTarget;
  const next=Math.round((+input.value+increments[event.key])*1e12)/1e12;
  input.value=Math.max(+input.min,Math.min(+input.max,next));
  input.dispatchEvent(new Event('input',{bubbles:true}));
});

$('reset').addEventListener('click',()=>setMode(mode));
$('view-reset').addEventListener('click',()=>{yaw=-.65;pitch=.42;draw();});
$('help').addEventListener('click',()=>$('help-dialog').showModal());$('close-help').addEventListener('click',()=>$('help-dialog').close());
scene.addEventListener('pointerdown',e=>{if(isAction()){if(phase==='running')actionTap();return;}drag=[e.clientX,e.clientY];scene.setPointerCapture(e.pointerId);});
scene.addEventListener('pointermove',e=>{if(!drag)return;yaw+=(e.clientX-drag[0])*.009;pitch=Math.max(-1.2,Math.min(1.2,pitch+(e.clientY-drag[1])*.009));drag=[e.clientX,e.clientY];draw();});
scene.addEventListener('pointerup',()=>drag=null);scene.addEventListener('pointercancel',()=>drag=null);
function updatePlayUI(){const action=isAction();document.body.dataset.solid=mode;$('result-values').hidden=!action||phase!=='result';$(action&&phase==='result'?'result-share-slot':'utility-share-slot').append($('share'));$('play-goal').hidden=false;$('play-goal').textContent=mode==='cube'?'断面を大きい五角形に':actionTitle();$('detail-hud').hidden=action;document.body.classList.toggle('detail-view',!action);if(action){$('result').insertBefore($('score'),$('result-status'));document.querySelector('.result-body').append($('measurements'));}else{$('hud-score').append($('score'));$('hud-measurements').append($('measurements'));}document.body.classList.toggle('action-play',action);document.body.classList.toggle('has-result',action&&phase==='result');$('detail-mode').classList.toggle('active',!action);$('detail-controls').hidden=action;for(const id of cubeSteps){$(id).disabled=action;const active=action&&phase==='running'&&(mode==='cube'?id===cubeSteps[cubeStep]:id==='offset');$(id).closest('.range-control').classList.toggle('moving',active);$(id).closest('.range-control').classList.toggle('waiting',action&&mode==='cube'&&!active);}$('reset').hidden=action;$('action-controls').hidden=!action||phase==='result';$('score').hidden=action&&phase!=='result';for(const id of ['score-kicker','retry'])$(id).hidden=!action||phase!=='result';$('detail-mode').setAttribute('aria-pressed',String(!action));$('detail-mode').setAttribute('aria-label',action?'詳細確認':'遊ぶに戻る');$('detail-mode').title=action?'詳細確認':'遊ぶに戻る';$('action-button').disabled=phase==='measuring';$('action-button').textContent=phase==='running'?(mode==='cube'?`${cubeStep+1}/3 ${cubeStepNames[cubeStep]}を止める`:'切る！'):phase==='measuring'?'測定中…':'はじめる';$('action-message').textContent=phase==='running'?'今！と思ったらタップ。':phase==='measuring'?'測定中…':'動くバーをタップで止める。';if(action){$('subtitle').textContent=actionTitle();$('preview-label').textContent=phase==='running'?'タップで切断':phase==='result'?'測定完了':actionTitle();}scene.style.cursor=action?'pointer':'grab';}
function beginMotion(){const input=$(mode==='cube'?cubeSteps[cubeStep]:'offset');motionMin=+input.min;motionMax=+input.max;if(mode==='cube'&&cubeSteps[cubeStep]==='offset'){const limit=Math.min(.86,parameters().n.reduce((sum,v)=>sum+Math.abs(v),0)/2)*.999;motionMin=-limit;motionMax=limit;}const fraction=Math.max(0,Math.min(1,(+input.value-motionMin)/(motionMax-motionMin)));motionPhase=Math.acos(1-2*fraction);if(Math.random()<.5)motionPhase=2*Math.PI-motionPhase;startTime=performance.now();}
function animateHeight(now){if(!isAction()||phase!=='running')return;const t=(now-startTime)/BAR_PERIOD_MS,height=(1-Math.cos(motionPhase+t*Math.PI*2))/2;$(mode==='cube'?cubeSteps[cubeStep]:'offset').value=motionMin+height*(motionMax-motionMin);draw();frame=requestAnimationFrame(animateHeight);}
function actionTap(){if(!isAction())return;if(phase==='ready'){sync();cubeStep=0;phase='running';beginMotion();updatePlayUI();frame=requestAnimationFrame(animateHeight);}else if(phase==='running'){
  if(mode==='cube'&&cubeStep<2){cubeStep++;beginMotion();updatePlayUI();return;}
  cancelAnimationFrame(frame);phase='measuring';cut=true;measured=measurement();updatePlayUI();startTime=performance.now();draw();frame=requestAnimationFrame(animateCut);
}}
function animateCut(now){if(!isAction()||phase!=='measuring')return;const t=Math.max(0,Math.min(1,(now-startTime-300)/700));cutProgress=t*t*(3-2*t);scene.dataset.cutProgress=cutProgress.toFixed(3);draw();if(t<1)frame=requestAnimationFrame(animateCut);else performCut();}
$('action-button').addEventListener('click',actionTap);
$('retry').addEventListener('click',()=>{setMode(mode);$('action-button').focus();});
$('detail-mode').addEventListener('click',()=>{detail=!detail;setMode(mode);});
function createCard(){if(cardURL)URL.revokeObjectURL(cardURL);const c=document.createElement('canvas');c.width=1080;c.height=1080;const g=c.getContext('2d');g.fillStyle='#36383e';g.fillRect(0,0,1080,1080);g.textAlign='center';g.fillStyle='#f5f5f5';g.font='28px sans-serif';g.fillText(`HITOKIRI / ${mode==='cube'?'CUBE':mode==='sphere'?'SPHERE':'CONE'} CHALLENGE`,540,100);g.fillStyle='#fff';g.font='bold 66px sans-serif';g.fillText(actionTitle(),540,215);g.font='bold 200px sans-serif';g.fillText(score+'点',540,440);g.drawImage(scene,220,460,640,360);g.font='34px sans-serif';g.fillText(actionValue(measured),540,900);g.fillStyle='#f5f5f5';g.font='30px sans-serif';g.fillText('ひと切り — あなたは何点？',540,1000);c.toBlob(blob=>{if(!blob)return;cardFile=new File([blob],'hitokiri-score.png',{type:'image/png'});cardURL=URL.createObjectURL(blob);$('download-card').href=cardURL;$('download-card').hidden=false;});}
$('share').addEventListener('click',async()=>{if(!measured)return;
  const url=`https://kiko-it.github.io/games/hitokiri/?mode=${mode}`;
  const tag={cube:'立方体',sphere:'球',cone:'円錐'}[mode];
  const text=`${score}点が取れました！\n${url}\n#ひと切り${tag}`;
  try{if(navigator.share){await navigator.share({title:'ひと切り',text});$('copy-status').textContent='共有しました';}else{await navigator.clipboard.writeText(text);$('copy-status').textContent='共有用の点数とURLをコピーしました';}}
  catch(e){if(e.name==='AbortError')return;$('share-fallback').hidden=false;$('share-fallback').value=text;$('share-fallback').select();$('copy-status').textContent='このテキストをコピーして共有できます';}
});
window.addEventListener('popstate',()=>setMode(urlMode()));
new ResizeObserver(()=>{draw();if(measured)drawSection();}).observe(scene);
setMode(urlMode());
