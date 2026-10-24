/* 過去の出陣編成を現在の資源で再現できるか、変更前に全件検証する。 */
(function(root){
  'use strict';
  const D=typeof module!=='undefined'?require('./data.js'):root.BanjinData;
  const P=typeof module!=='undefined'?require('./profile.js'):root.BanjinProfile;
  function plan(profile,record){
    const errors=[], formation=[], cells=new Set(), ids=new Set(), serials=new Set(), counts={}, equipment={};
    const stage=record?.stage, source=record?.departure?.formation;
    if(!Number.isInteger(stage)||stage<1||stage>Math.min(profile.unlocked,D.maxStage)) errors.push('ステージが未解禁、または番号が不正です。');
    if(!Array.isArray(source)||!source.length||source.length>27) return {ok:false,errors:[...errors,'出陣編成の記録が不正です。']};
    let cost=0, points=0;
    const sharedUpgrades={};
    for(const stat of Object.keys(D.statNames)){
      const n=record.departure.profile?.sharedUpgrades?.[stat]??0;
      if(!Number.isInteger(n)||n<0||n>999) errors.push('共通強化の記録が不正です。');
      else {sharedUpgrades[stat]=n;points+=n*(n+1)/2;}
    }
    for(const item of source){
      if(!item||!Object.hasOwn(D.pieces,item.type)){errors.push('不明な駒が含まれています。');continue;}
      const u=P.clone(item);
      if(typeof u.id!=='string'||!/^ally-[a-z0-9-]+$/.test(u.id)||ids.has(u.id)||!Number.isInteger(u.serial)||u.serial<1||serials.has(u.serial)) errors.push('駒の識別番号が不正です。');
      ids.add(u.id);serials.add(u.serial);
      if(!Number.isInteger(u.x)||u.x<0||u.x>8||!Number.isInteger(u.y)||u.y<6||u.y>8||cells.has(`${u.x},${u.y}`)) errors.push('配置が自陣外、または重複しています。');
      cells.add(`${u.x},${u.y}`);cost+=D.pieces[u.type].cost;
      counts[u.type]=(counts[u.type]||0)+1;
      if(counts[u.type]>D.unitLimits[u.type]) errors.push(`${D.pieces[u.type].name}の編成上限を超えています。`);
      if(!Array.isArray(u.equipment)||u.equipment.some(id=>!Object.hasOwn(D.equipment,id))||new Set(u.equipment).size!==u.equipment.length) errors.push('装備の記録が不正です。');
      else {
        if(D.usedSlots(u.equipment)>D.equipmentSlots(u.type,profile.unlocked,profile.slotBonus)) errors.push(`${D.pieces[u.type].name}の装備枠が不足しています。`);
        for(const id of u.equipment) equipment[id]=(equipment[id]||0)+1;
      }
      u.upgradePointsSpent=0;
      const upgrades={};
      for(const stat of Object.keys(D.statNames)){
        const n=u.upgrades?.[stat]??0;
        if(!Number.isInteger(n)||n<0||n>999) errors.push('強化回数の記録が不正です。');
        else {upgrades[stat]=0;if(n>0) errors.push('個別強化を含む旧記録は共通強化で再現できません。');}
      }
      u.upgrades=upgrades;points+=u.upgradePointsSpent;formation.push(u);
    }
    const limit=Math.min(61,profile.unlocked+20+P.costBonus(profile));
    if(cost>limit) errors.push(`コスト不足：必要 ${cost} / 上限 ${limit}`);
    if((D.kingDefense(stage)||stage>=41) && counts.king!==1) errors.push('第二幕には王将が1体必要です。');
    for(const [id,n] of Object.entries(equipment)) if(n>(profile.inventory[id]||0)) errors.push(`装備不足：${D.equipment[id].name} 必要 ${n} / 所持 ${profile.inventory[id]||0}`);
    const available=profile.growthPoints+(profile.sharedUpgradePointsSpent||0);
    if(points>available) errors.push(`強化ポイント不足：必要 ${points}P / 再配分可能 ${available}P`);
    return errors.length?{ok:false,errors}:{ok:true,stage,formation,sharedUpgrades,sharedUpgradePointsSpent:points,growthPoints:available-points,cost,upgradePoints:points,nextSerial:Math.max(profile.nextSerial,...formation.map(u=>u.serial+1))};
  }
  if(typeof module!=='undefined') module.exports={plan};else root.BanjinDebugPlanner={plan};
})(typeof window==='undefined'?globalThis:window);
