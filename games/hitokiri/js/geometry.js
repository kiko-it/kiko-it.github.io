// 採点は描画メッシュに依存しない。一辺1の立方体、半径1の球。
export const add=(a,b)=>a.map((v,i)=>v+b[i]);
export const sub=(a,b)=>a.map((v,i)=>v-b[i]);
export const mul=(a,s)=>a.map(v=>v*s);
export const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
export const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
export const norm=a=>Math.hypot(...a);
export const unit=a=>mul(a,1/norm(a));
export const vertices=Array.from({length:8},(_,i)=>[i&1?.5:-.5,i&2?.5:-.5,i&4?.5:-.5]);
export const faces=[[0,2,3,1],[4,5,7,6],[0,1,5,4],[2,6,7,3],[0,4,6,2],[1,3,7,5]];
export const edges=vertices.flatMap((_,i)=>[1,2,4].filter(b=>!(i&b)).map(b=>[i,i|b]));
export function normal(azimuth,elevation){
  const a=azimuth*Math.PI/180,e=elevation*Math.PI/180;
  return [Math.cos(e)*Math.cos(a),Math.sin(e),Math.cos(e)*Math.sin(a)];
}
export function basis(n){const u=unit(cross(n,Math.abs(n[1])<.9?[0,1,0]:[1,0,0]));return [u,cross(n,u)];}
export function measurePolygon(points){
  if(points.length<3)return {area:0,perimeter:0,sides:0,lengths:[],cv:0};
  const lengths=points.map((p,i)=>norm(sub(p,points[(i+1)%points.length])));
  const perimeter=lengths.reduce((a,b)=>a+b,0),mean=perimeter/lengths.length;
  const area=norm(points.reduce((s,p,i)=>add(s,cross(p,points[(i+1)%points.length])),[0,0,0]))/2;
  return {area,perimeter,sides:area>1e-9?points.length:0,lengths,cv:mean?Math.sqrt(lengths.reduce((s,l)=>s+(l-mean)**2,0)/lengths.length)/mean:0};
}
export function cubeSection(n,d){
  n=unit(n);const points=[];
  const push=p=>{if(!points.some(q=>norm(sub(p,q))<1e-8))points.push(p);};
  for(const [i,j] of edges){const a=vertices[i],b=vertices[j],da=dot(n,a)-d,db=dot(n,b)-d;
    if(Math.abs(da)<1e-9)push(a);
    if(Math.abs(db)<1e-9)push(b);
    if(da*db<0)push(add(a,mul(sub(b,a),da/(da-db))));
  }
  const [u,v]=basis(n),center=points.length?mul(points.reduce(add,[0,0,0]),1/points.length):[0,0,0];
  points.sort((a,b)=>Math.atan2(dot(sub(a,center),v),dot(sub(a,center),u))-Math.atan2(dot(sub(b,center),v),dot(sub(b,center),u)));
  // 頂点や辺をちょうど通る際、一直線上の点を辺数に数えない。
  let clean=points.filter((p,i)=>norm(cross(sub(p,points[(i+points.length-1)%points.length]),sub(points[(i+1)%points.length],p)))>1e-9);
  if(clean.length<3)clean=[];
  const clipped=faces.map(f=>clip(f.map(i=>vertices[i]),n,d)).filter(f=>f.length>=3);
  if(clean.length)clipped.push(clean);
  const all=clipped.flat(),inside=all.length?mul(all.reduce(add,[0,0,0]),1/all.length):[0,0,0];
  let volume=0;
  for(const face of clipped)for(let i=1;i<face.length-1;i++)volume+=Math.abs(dot(sub(face[0],inside),cross(sub(face[i],inside),sub(face[i+1],inside))))/6;
  return {points:clean,...measurePolygon(clean),volume:Math.max(0,Math.min(1,volume)),clipped};
}
function clip(poly,n,d){const out=[];for(let i=0;i<poly.length;i++){
  const a=poly[i],b=poly[(i+1)%poly.length],da=dot(n,a)-d,db=dot(n,b)-d;
  if(da<=0)out.push(a);if((da<0&&db>0)||(da>0&&db<0))out.push(add(a,mul(sub(b,a),da/(da-db))));
}return out;}
export function sphereSection(d){d=Math.max(-1,Math.min(1,d));const r=Math.sqrt(Math.max(0,1-d*d)),h=d+1;
  return {radius:r,area:Math.PI*r*r,perimeter:2*Math.PI*r,volume:Math.PI*h*h*(1-h/3),total:4*Math.PI/3};
}
// 底面半径1、高さ√3。heightは底面からの実距離。頂点側を測る。
export const CONE_HEIGHT=Math.sqrt(3);
export function coneSection(height){const h=Math.max(0,Math.min(CONE_HEIGHT,height)),r=1-h/CONE_HEIGHT;
  return {radius:r,area:Math.PI*r*r,perimeter:2*Math.PI*r,volume:Math.PI*CONE_HEIGHT*r*r*r/3,total:Math.PI*CONE_HEIGHT/3};
}
export function evaluateGoal(mode,m,metric='area'){
  if(mode==='cube')return {success:m.sides===5&&Math.abs(m.area-.8)<=.025,error:Math.abs(m.area-.8)/.8};
  const value=metric==='volume'?m.volume/m.total:metric==='area'?m.area/Math.PI:m.perimeter/(2*Math.PI);
  return {success:Math.abs(value-.5)<=.02,error:Math.abs(value-.5)/.5,value};
}
