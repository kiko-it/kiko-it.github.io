/* global Matter, decomp, WARDS, Rules */
(() => {
  'use strict';
  const {Engine,Bodies,Body,Composite,Common,Vertices,Sleeping}=Matter;
  Common.setDecomp(decomp);
  const $=id=>document.getElementById(id), canvas=$('game'), ctx=canvas.getContext('2d');
  // Game-specific regions; boundaries vary between geographic classifications.
  const regions=[
    {name:'都心',color:'#e8c978',ids:[0,1,2]},
    {name:'城南',color:'#df9c85',ids:[8,9,10,11]},
    {name:'城西',color:'#91bea5',ids:[3,12,13,14,19]},
    {name:'城北',color:'#b6a3ce',ids:[4,15,16,17,18]},
    {name:'城東',color:'#85b9d0',ids:[5,6,7,20,21,22]}
  ];
  const wardColor=id=>regions.find(region=>region.ids.includes(id)).color;
  document.querySelectorAll('.region-legend').forEach(el=>regions.forEach(region=>{
    const item=document.createElement('span'),swatch=document.createElement('i');
    swatch.style.backgroundColor=region.color;swatch.ariaHidden='true';
    item.append(swatch,region.name);el.append(item);
  }));
  const engine=Engine.create({enableSleeping:true,positionIterations:10,velocityIterations:8});engine.gravity.y=1.25;
  const walls=[Bodies.rectangle(230,630,480,30,{isStatic:true}),Bodies.rectangle(4,365,18,530,{isStatic:true}),Bodies.rectangle(456,365,18,530,{isStatic:true})];
  Composite.add(engine.world,walls);
  let groups=[],running=false,paused=false,round=1,score=0,best=0,bag=[],nextId=0,aim=230,clock=0,lastDrop=-1000,lastShuffle=-5000,grace=0,overflowTime=0,roundWait=0,toastTime=0,completionDeadline=null;
  try{best=Number(localStorage.getItem('tokyo-connect-best'))||0;}catch{}$('best').textContent=best;
  const scale=1.3;
  const enteredWards=new Set();
  const wards=WARDS.map(w=>({...w,points:w.points.map(([x,y])=>({x:x*scale,y:y*scale})),center:{x:w.center[0]*scale,y:w.center[1]*scale}}));
  const bounds=points=>({min:{x:Math.min(...points.map(p=>p.x)),y:Math.min(...points.map(p=>p.y))},max:{x:Math.max(...points.map(p=>p.x)),y:Math.max(...points.map(p=>p.y))}});
  const rotate=(p,a)=>({x:p.x*Math.cos(a)-p.y*Math.sin(a),y:p.x*Math.sin(a)+p.y*Math.cos(a)});
  function makeGroup(ids){
    const parts=ids.flatMap(id=>{
      const w=wards[id], c=Vertices.centre(w.points);
      const shape=Bodies.fromVertices(c.x,c.y,[w.points],{friction:.6,frictionStatic:.8,restitution:.02,frictionAir:.018},true,.5,2,.5);
      const wardParts=shape.parts.length>1?shape.parts.slice(1):[shape];
      wardParts.forEach(part=>{part.wardId=id;});
      return wardParts;
    });
    // Let settled pieces sleep instead of continuously resolving tiny contacts.
    const body=Body.create({parts,friction:.6,frictionStatic:.8,restitution:.02,frictionAir:ids.length>1?.06:.025,sleepThreshold:45});
    Body.setInertia(body,body.inertia*(ids.length>1?6:2));
    return {ids:[...ids],body,origin:{...body.position},born:clock,glow:0};
  }
  function fit(g){
    let b=g.body.bounds,dx=0,dy=0;
    if(b.min.x<15)dx=15-b.min.x;
    if(b.max.x+dx>445)dx+=445-(b.max.x+dx);
    if(b.max.y>612)dy=612-b.max.y;
    Body.translate(g.body,{x:dx,y:dy});
  }
  function take(){return bag.length?bag.shift():null;}
  function prepareRound(){bag=Rules.wardOrder(wards);nextId=take();completionDeadline=null;}
  const roundStatus=document.createElement("p");roundStatus.id="round-status";roundStatus.className="round-status";roundStatus.setAttribute("role","status");canvas.closest(".play-area").append(roundStatus);
  const countdown=document.createElement('div');countdown.id='countdown';countdown.className='countdown';countdown.hidden=true;countdown.setAttribute('role','timer');$('board').prepend(countdown);
  function updateRoundStatus(){countdown.hidden=completionDeadline===null||roundWait>0;const seconds=completionDeadline===null?30:Math.max(0,Math.ceil((completionDeadline-clock)/1000));countdown.textContent=`完成まで 00:${String(seconds).padStart(2,"0")}`;countdown.classList.toggle("urgent",seconds<=10);const text=completionDeadline!==null&&!roundWait?`完成まで ${Math.max(0,Math.ceil((completionDeadline-clock)/1000))}秒 / 23区すべて投入済み`:`投入 ${23-bag.length-(nextId===null?0:1)} / 23区`;if(roundStatus.textContent!==text)roundStatus.textContent=text;}
  function toast(message){$('toast').textContent=message;toastTime=2200;$('toast').classList.add('visible');}
  function updateHud(){
    const largest=groups.reduce((a,g)=>g.ids.length>a.length?g.ids:a,[]);
    $('round').textContent=String(round).padStart(2,'0');$('score').textContent=score.toLocaleString();$('connected').textContent=largest.length;$('progress').style.width=`${largest.length/23*100}%`;
    $('next-name').textContent=nextId===null?'全区投入済み':wards[nextId].name;$('neighbor-names').textContent=nextId===null?'シャッフルでつなげよう':'つながる区：'+wards[nextId].neighbors.map(i=>wards[i].name.replace('区','')).join('・');
    updateRoundStatus();drawPreview();drawMap($('minimap'),largest,false);
  }
  function saveBest(){if(score>best){best=score;$('best').textContent=best.toLocaleString();try{localStorage.setItem('tokyo-connect-best',String(best));}catch{}}}
  function clearBox(){enteredWards.clear();groups.forEach(g=>Composite.remove(engine.world,g.body));groups=[];Engine.clear(engine);}
  function start(){
    clearBox();clock=0;round=1;score=0;prepareRound();running=true;paused=false;lastDrop=-1000;lastShuffle=-5000;grace=0;overflowTime=0;roundWait=0;aim=230;
    $('overlay').hidden=true;$('shuffle').disabled=false;$('pause').disabled=false;$('pause').textContent='Ⅱ';$('pause').ariaLabel='一時停止';$('start').textContent='ゲームをはじめる →';toast('落とす場所を選んで、離そう');updateHud();
  }
  function drop(){
    if(!running||paused||roundWait||nextId===null||clock-lastDrop<650)return false;
    const g=makeGroup([nextId]);Body.setPosition(g.body,{x:aim,y:67});fit(g);Composite.add(engine.world,g.body);groups.push(g);lastDrop=clock;score+=5;nextId=take();if(nextId===null)completionDeadline=clock+30000;updateHud();return true;
  }
  function merge(a,b){
    // Keep the established larger group in place, regardless of collision order.
    if(b.ids.length>a.ids.length||(b.ids.length===a.ids.length&&(b.body.isSleeping&&!a.body.isSleeping||b.body.speed<a.body.speed)))[a,b]=[b,a];
    const g=makeGroup([...a.ids,...b.ids]);
    const offset=rotate({x:g.origin.x-a.origin.x,y:g.origin.y-a.origin.y},a.body.angle);
    Body.setAngle(g.body,a.body.angle);Body.setPosition(g.body,{x:a.body.position.x+offset.x,y:a.body.position.y+offset.y});
    // Snapping changes the shape abruptly; carrying the incoming impulse makes
    // the entire group drift or spin. Gravity and future impacts still apply.
    Body.setVelocity(g.body,{x:0,y:0});Body.setAngularVelocity(g.body,0);
    g.born=Math.min(a.born,b.born);g.glow=1000;fit(g);
    Composite.remove(engine.world,a.body);Composite.remove(engine.world,b.body);groups=groups.filter(x=>x!==a&&x!==b);groups.push(g);Composite.add(engine.world,g.body);
    score+=g.ids.length*20;grace=1100;overflowTime=0;toast(`${g.ids.length}区がつながった！`);saveBest();
    if(Rules.complete(g.ids)){roundWait=2300;score+=2300;saveBest();toast('23区完成！ 次の周へ');}
    updateHud();
  }
  function shuffle(){
    if(!running||paused||roundWait)return false;
    lastShuffle=clock;grace=1900;overflowTime=0;
    groups.forEach((g,i)=>{Sleeping.set(g.body,false);Body.setVelocity(g.body,{x:(i%2?1:-1)*(4+Math.random()*3),y:-4-Math.random()*3});Body.setAngularVelocity(g.body,(Math.random()-.5)*.07);});toast('ゆらゆら、つながるきっかけ。');return true;
  }
  function gameOver(timeout=false,escaped=false){running=false;saveBest();$('overlay-title').textContent=timeout?'時間切れです':escaped?'区が箱の外に出ちゃった':'箱からあふれちゃった';$('overlay-message').textContent=`${round}周目 / スコア ${score.toLocaleString()}。もう一度、東京をつなげよう。`;$('start').textContent='もう一度あそぶ →';$('overlay').hidden=false;$('shuffle').disabled=true;$('pause').disabled=true;}
  function setPaused(value){if(!running||roundWait)return;paused=value;$('pause').textContent=paused?'▶':'Ⅱ';$('pause').ariaLabel=paused?'再開':'一時停止';$('overlay').hidden=!paused;if(paused){$('overlay-title').textContent='ひとやすみ';$('overlay-message').textContent='つづきは、いつでも。';$('start').textContent='つづける →';}}
  function tick(dt){
    if(!running||paused)return;
    clock+=dt;grace=Math.max(0,grace-dt);toastTime-=dt;if(toastTime<=0)$('toast').classList.remove('visible');
    $('shuffle').disabled=roundWait>0;
    if(roundWait>0){roundWait-=dt;if(roundWait<=0){roundWait=0;clearBox();round++;prepareRound();lastDrop=clock-1000;grace=1000;overflowTime=0;updateHud();toast(`${round}周目！ 東京をもう一度`);}return;}
    updateRoundStatus();
    // A fixed physics step avoids high refresh rate changing gravity or input cooldown.
    Engine.update(engine,1000/60);
    groups.forEach(g=>{g.glow=Math.max(0,g.glow-dt);if(g.body.speed>13)Body.setVelocity(g.body,{x:g.body.velocity.x*13/g.body.speed,y:g.body.velocity.y*13/g.body.speed});});
    // Check each ward, including wards within a compound group. New drops
    // start above the rim and become eligible only after entering the box.
    for(const g of groups)for(const id of g.ids){
      const ys=wards[id].points.map(p=>g.body.position.y+rotate({x:p.x-g.origin.x,y:p.y-g.origin.y},g.body.angle).y);
      if(Math.max(...ys)>=126)enteredWards.add(id);
      if(Rules.escaped(ys,enteredWards.has(id))){gameOver(false,true);return;}
    }
    // Use actual colliding convex parts, rather than overlapping bounding boxes.
    const pairs=engine.pairs.list.filter(p=>p.isActive);
    for(const pair of pairs){
      const a=groups.find(g=>g.body===pair.bodyA.parent),b=groups.find(g=>g.body===pair.bodyB.parent);
      if(a&&b&&a!==b&&Rules.canMerge(a.ids,b.ids,wards,[pair.bodyA.wardId,pair.bodyB.wardId])){merge(a,b);break;}
    }
    if(!roundWait&&completionDeadline!==null&&clock>=completionDeadline){gameOver(true);return;}
    const danger=groups.some(g=>Rules.overflow(g.body.bounds,clock-g.born,grace));
    overflowTime=danger?overflowTime+dt:0;
    if(overflowTime>2000)gameOver();
  }
  function polygon(c,points){c.beginPath();points.forEach((p,i)=>i?c.lineTo(p.x,p.y):c.moveTo(p.x,p.y));c.closePath();}
  function paintWard(c,w,fill,labels=true,stroke='#fcfcf2'){
    polygon(c,w.points);c.fillStyle=fill;c.fill();c.strokeStyle=stroke;c.lineWidth=1.1;c.lineJoin='round';c.stroke();
    if(labels){c.fillStyle='#294c43';c.font='600 10px "Noto Sans JP", sans-serif';c.textAlign='center';c.textBaseline='middle';c.fillText(w.name,w.center.x,w.center.y);}
  }
  function drawGroup(g){ctx.save();ctx.translate(g.body.position.x,g.body.position.y);ctx.rotate(g.body.angle);ctx.translate(-g.origin.x,-g.origin.y);if(g.glow){ctx.shadowColor='#dcb765';ctx.shadowBlur=12*g.glow/1000;}g.ids.forEach(id=>paintWard(ctx,wards[id],wardColor(id)));ctx.restore();}
  function drawPreview(){if(nextId===null){$('next').getContext('2d').clearRect(0,0,180,130);return;}const c=$('next').getContext('2d'),w=wards[nextId],b=bounds(w.points),s=Math.min(1.6,130/(b.max.x-b.min.x),95/(b.max.y-b.min.y));c.clearRect(0,0,180,130);c.save();c.translate(90,65);c.scale(s,s);c.translate(-w.center.x,-w.center.y);paintWard(c,w,wardColor(nextId),false);c.restore();}
  function drawMap(el,ids,labels){const c=el.getContext('2d'),all=wards.flatMap(w=>w.points),b=bounds(all),s=Math.min((el.width-24)/(b.max.x-b.min.x),(el.height-24)/(b.max.y-b.min.y));c.clearRect(0,0,el.width,el.height);c.save();c.translate(el.width/2,el.height/2);c.scale(s,s);c.translate(-(b.min.x+b.max.x)/2,-(b.min.y+b.max.y)/2);wards.forEach(w=>paintWard(c,w,ids.includes(w.id)?wardColor(w.id):'#dce2d3',labels));c.restore();}
  function draw(){
    ctx.clearRect(0,0,460,630);ctx.fillStyle='#fafbf5';ctx.fillRect(0,0,460,630);
    ctx.fillStyle='#e5eadd';for(let x=26;x<450;x+=24)for(let y=138;y<610;y+=24){ctx.beginPath();ctx.arc(x,y,.8,0,Math.PI*2);ctx.fill();}
    ctx.strokeStyle=overflowTime?'#d36657':'#d5a094';ctx.lineWidth=1;ctx.setLineDash([4,6]);ctx.beginPath();ctx.moveTo(18,116);ctx.lineTo(442,116);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle='#bc9186';ctx.font='9px sans-serif';ctx.textAlign='right';ctx.fillText(overflowTime?'あふれそう！':'OVERFLOW LINE',435,106);
    ctx.strokeStyle='#bdccba';ctx.lineWidth=5;ctx.lineJoin='round';ctx.beginPath();ctx.moveTo(13,126);ctx.lineTo(13,614);ctx.lineTo(447,614);ctx.lineTo(447,126);ctx.stroke();
    groups.forEach(drawGroup);
    if(running&&!paused&&!roundWait&&nextId!==null){
      const w=wards[nextId],b=bounds(w.points),x=Math.max(15+(w.center.x-b.min.x),Math.min(445-(b.max.x-w.center.x),aim));
      ctx.save();ctx.globalAlpha=clock-lastDrop<650?.25:.85;ctx.translate(x-w.center.x,62-w.center.y);paintWard(ctx,w,wardColor(nextId));ctx.restore();
      ctx.strokeStyle='#96b8a680';ctx.setLineDash([3,6]);ctx.beginPath();ctx.moveTo(x,90);ctx.lineTo(x,605);ctx.stroke();ctx.setLineDash([]);
    }
    if(clock-lastShuffle<550&&running&&!paused){const t=(clock-lastShuffle)/550;ctx.strokeStyle=`rgba(83,142,115,${(1-t)*.5})`;ctx.lineWidth=8;ctx.strokeRect(5,122,450,500);}
  }
  function pointerAim(e){const rect=canvas.getBoundingClientRect();aim=Math.max(45,Math.min(415,(e.clientX-rect.left)/rect.width*460));}
  canvas.addEventListener('pointerdown',e=>{if(!running||paused)return;pointerAim(e);canvas.setPointerCapture(e.pointerId);});
  canvas.addEventListener('pointermove',pointerAim);canvas.addEventListener('pointerup',e=>{pointerAim(e);drop();});
  document.addEventListener('keydown',e=>{if($('help-dialog').open||['BUTTON','A'].includes(document.activeElement.tagName))return;if(['ArrowLeft','ArrowRight','Space'].includes(e.code)){e.preventDefault();if(e.code==='Space'){if(!e.repeat)drop();}else aim=Math.max(45,Math.min(415,aim+(e.code==='ArrowLeft'?-14:14)));}if(e.code==='KeyS')shuffle();if(e.code==='KeyP')setPaused(!paused);});
  let restartArmed=false;
  $('start').onclick=()=>{restartArmed=false;if(paused)setPaused(false);else start();canvas.focus();};$('shuffle').onclick=()=>{shuffle();canvas.focus();};$('pause').onclick=()=>{restartArmed=false;setPaused(!paused);canvas.focus();};
  $('restart').onclick=()=>{if(!running||(paused&&restartArmed)){restartArmed=false;start();canvas.focus();return;}if(roundWait>0)return;setPaused(true);restartArmed=true;$('overlay-title').textContent='最初からあそぶ？';$('overlay-message').textContent='下の「つづける」で戻れます。↻ をもう一度押すとリセット。';};
  let pausedForHelp=false;$('help').onclick=()=>{pausedForHelp=running&&!paused;if(pausedForHelp)setPaused(true);drawMap($('help-map'),wards.map(w=>w.id),true);$('help-dialog').showModal();};$('close-help').onclick=()=>$('help-dialog').close();$('help-dialog').addEventListener('close',()=>{if(pausedForHelp)setPaused(false);});
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&running&&!paused)setPaused(true);});
  let prev=performance.now(),accumulator=0;function frame(now){const dt=Math.min(100,now-prev);prev=now;accumulator+=dt;while(accumulator>=1000/60){tick(1000/60);accumulator-=1000/60;}draw();requestAnimationFrame(frame);}drawMap($('minimap'),[],false);requestAnimationFrame(frame);
  // Read-only state plus deterministic fixtures, enabled exclusively for local QA.
  if(location.hostname==='127.0.0.1'&&new URLSearchParams(location.search).has('test')){
    window.gameTest={state:()=>({running,paused,round,score,groups:groups.map(g=>({ids:g.ids,position:{...g.body.position},angle:g.body.angle,sleeping:g.body.isSleeping,velocity:{...g.body.velocity},angularVelocity:g.body.angularVelocity,partsShareBody:g.body.parts.every(part=>part.parent===g.body),wardCenters:g.ids.map(id=>({id,...(()=>{const p=rotate({x:wards[id].center.x-g.origin.x,y:wards[id].center.y-g.origin.y},g.body.angle);return {x:g.body.position.x+p.x,y:g.body.position.y+p.y};})()})),bounds:g.body.bounds})),nextId,lastShuffle,remaining:[...bag],completionDeadline,clock}),drop,shuffle,start,advance(ms){for(let t=0;t<ms;t+=1000/60)tick(Math.min(1000/60,ms-t));},
      fixture(kind){clearBox();completionDeadline=null;running=true;paused=false;roundWait=0;grace=0;overflowTime=0;$('overlay').hidden=true;
        if(kind==='merge-motion'){
          const a=makeGroup([0,1,2,3]),b=makeGroup([4]);
          Body.setPosition(a.body,{x:230,y:400});Body.setAngle(a.body,.12);
          Body.setPosition(b.body,{x:300,y:340});Body.setVelocity(b.body,{x:-7,y:9});Body.setAngularVelocity(b.body,.1);
          groups.push(a,b);Composite.add(engine.world,[a.body,b.body]);
          const before=window.gameTest.state().groups[0].wardCenters;
          merge(b,a);return {before,after:window.gameTest.state()};
        }
        if(kind==='settle'){
          nextId=0;lastDrop=clock-1000;aim=230;
          [19,10,21].forEach((id,i)=>{const g=makeGroup([id]);Body.setPosition(g.body,{x:230,y:540-i*140});groups.push(g);Composite.add(engine.world,g.body);});
        }
        if(kind==='contact-blocked'||kind==='contact-allowed'){
          const a=makeGroup([0,1]),b=makeGroup([6]),target=kind==='contact-blocked'?0:1;
          Body.setPosition(a.body,{x:230,y:400});Body.setStatic(a.body,true);
          let found=false;
          for(let y=340;y<=460&&!found;y+=2)for(let x=150;x<=310;x+=2){
            Body.setPosition(b.body,{x,y});
            const hits=Matter.Query.collides(b.body,a.body.parts.slice(1));
            if(hits.length&&hits.every(hit=>(hit.bodyA.wardId===6?hit.bodyB:hit.bodyA).wardId===target)){found=true;break;}
          }
          if(!found)throw new Error('Contact fixture could not be placed');
          groups.push(a,b);Composite.add(engine.world,[a.body,b.body]);
          tick(1000/60);
        }
        if(kind==='last-ward'){
          prepareRound();bag=[];nextId=22;lastDrop=clock-1000;
          const g=makeGroup(wards.slice(0,22).map(w=>w.id));Body.setPosition(g.body,{x:230,y:400});Body.setStatic(g.body,true);groups.push(g);Composite.add(engine.world,g.body);
        }
        if(kind==='escaped'||kind==='partial-exit'||kind==='compound-exit'){const g=makeGroup(kind==='compound-exit'?[0,10]:[0]);const topWard=wards[0],maxY=Math.max(...topWard.points.map(p=>p.y));Body.translate(g.body,{x:100-g.body.position.x,y:(kind==='partial-exit'?140:120)-maxY});Body.setStatic(g.body,true);enteredWards.add(0);groups.push(g);Composite.add(engine.world,g.body);grace=1900;lastShuffle=clock;}
        if(kind==='timer'){bag=[];nextId=null;completionDeadline=clock+30000;}
        if(kind==='merge'){for(const id of [0,1]){const g=makeGroup([id]);Body.setPosition(g.body,{x:230+(id?10:0),y:450});g.born=clock-3000;groups.push(g);Composite.add(engine.world,g.body);}}
        if(kind==='complete'){const a=makeGroup(wards.slice(0,22).map(w=>w.id)),b=makeGroup([22]);Body.setPosition(a.body,{x:230,y:390});Body.setPosition(b.body,{x:230,y:390});groups.push(a,b);Composite.add(engine.world,[a.body,b.body]);merge(a,b);}
        if(kind==='overflow'){const g=makeGroup([0]);Body.setPosition(g.body,{x:230,y:100});Body.setStatic(g.body,true);g.born=clock-3000;groups.push(g);Composite.add(engine.world,g.body);}updateHud();}};
  }
})();
