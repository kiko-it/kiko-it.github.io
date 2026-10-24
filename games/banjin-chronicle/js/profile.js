/* 編成・所持装備・報酬を一つの保存単位として扱う。DOMやStorageには依存しない。 */
(function (root) {
  'use strict';
  const D = typeof module !== 'undefined' ? require('./data.js') : root.BanjinData;
  const rewardOrder = ['blade', 'flame', 'bow', 'heal', 'banner', 'curse'];
  function legacyStageRewards(stage) {
    const rewards = [rewardOrder[(stage - 1) % 6], rewardOrder[stage % 6], stage % 15 === 0 ? 'pierce' : stage % 10 === 0 ? 'scope' : rewardOrder[(stage + 1) % 6]];
    // 序盤の攻撃装備は残し、新装備はStage4からクリア枠で順に入手できる。
    if (stage >= 4) rewards[0] = ['armor', 'grimoire', 'ward', 'gauntlet', ...rewardOrder][(stage - 4) % 10];
    if (stage === 10) { rewards[2] = rewards[0]; rewards[0] = 'scope'; }
    if (stage === 12) rewards[0] = 'pierce';
    return rewards;
  }
  const clearRewards = ['blade','flame','bow','armor','heal','ward','gauntlet','banner','grimoire','scope','curse','pierce','armor','healGreater','gauntlet','bannerGreater','ward','curseGreater','grimoire','scope'];
  const chapterTwoRewards = ['armor','ward','gauntlet','grimoire','healGreater','blade','flame','bannerGreater','bow','pierce','armor','ward','curseGreater','grimoire','blade','healGreater','gauntlet','bannerGreater','curseGreater','scope'];
  function stageRewards(stage) {
    const rewards = legacyStageRewards(stage);
    if(stage>=42)return [
      ['bulwark','thunder','bulwark','thunder','healGreater','bulwark','thunder','curseGreater','scope'][stage-42],
      stage%2?'bulwark':'thunder',stage%2?'grimoire':'armor'
    ];
    if (stage <= 20) rewards[0] = clearRewards[stage-1];
    else if (stage <= 40) rewards[0] = chapterTwoRewards[stage-21];
    return stage <= 20 ? rewards.slice(0, 2) : rewards;
  }
  const saveKey = 'banjin-chronicle-profile-v2';
  const legacyKey = 'banjin-chronicle-progress-v1';
  const clone = value => JSON.parse(JSON.stringify(value));
  const integer = (value, fallback, max = 1000000) => Number.isInteger(value) && value >= 0 ? Math.min(value, max) : fallback;

  function defaults(unlocked = 1) {
    const cleared = Array.from({ length: unlocked - 1 }, (_, i) => i + 1);
    const slotRewardClaims = Object.fromEntries(D.slotRewardStages.filter(stage=>stage<unlocked).map(stage=>[stage,true]));
    return { version: 2, defaultSwordMigrated: true, starterWeapons27Migrated: true, chapterOneMigrated: true, slotBonus: Object.keys(slotRewardClaims).length, slotRewardClaims, starterWeaponsMigrated: true, sharedUpgrades: {}, sharedUpgradePointsSpent: 0, earlySpecialsMigrated: true, unlocked, stage: 1, inventory: {sword:27,staff:27}, rewardIndex: 0, nextSerial: 6, stageRecords: {}, rewardClaims: Object.fromEntries(cleared.map(stage => [stage, [true, true, true]])), growthCleared: Object.fromEntries(cleared.map(stage => [stage, true])), growthPoints: 0,
      formation: D.defaults.map((type, i) => ({ id: `ally-${type}`, serial: i + 1, type,
        x: D.positions[type][0], y: D.positions[type][1], equipment: ['sword'] })) };
  }

  // 第二幕の動作確認用。実際の全40報酬・20P・節目4枠だけを持つ新規状態。
  function chapterTwoStart() {
    const p=defaults();p.unlocked=p.stage=21;
    for(let stage=1;stage<=20;stage++){
      p.stageRecords[stage]={rank:'S',clears:1};p.rewardClaims[stage]=[true,true,false];p.growthCleared[stage]=true;
      for(const id of stageRewards(stage)){p.inventory[id]=(p.inventory[id]||0)+1;p.rewardIndex++;}
      if(D.slotRewardStages.includes(stage)){p.slotRewardClaims[stage]=true;p.slotBonus++;}
    }
    p.growthPoints=20;
    const serial=p.nextSerial++;p.formation.push({id:`ally-${serial}`,serial,type:'king',x:4,y:8,equipment:['sword']});
    return normalize(p);
  }

  function chapterThreeStart(){
    const p=chapterTwoStart();p.stage=p.unlocked=41;
    for(let stage=21;stage<=40;stage++){
      p.stageRecords[stage]={rank:'S',clears:1};p.rewardClaims[stage]=[true,true,true];p.growthCleared[stage]=true;
      for(const id of stageRewards(stage)){p.inventory[id]=(p.inventory[id]||0)+1;p.rewardIndex++;}
      if(D.slotRewardStages.includes(stage)){p.slotRewardClaims[stage]=true;p.slotBonus++;}
    }
    p.growthPoints=40;return normalize(p);
  }
  function grantChapterThreeGifts(p){
    if(p.chapterThreeGiftsClaimed)return [];
    const items=['thunder','bulwark'];
    for(const id of items){p.inventory[id]=(p.inventory[id]||0)+1;p.rewardIndex++;}
    p.chapterThreeGiftsClaimed=true;return items;
  }
  function normalize(raw) {
    const base = defaults();
    if (!raw || typeof raw !== 'object') return base;
    base.unlocked = Math.max(1, integer(raw.unlocked, 1, 999));
    base.stage = Math.max(1, Math.min(base.unlocked, integer(raw.stage, 1, 999)));
    base.slotBonus = integer(raw.slotBonus,0,100);
    for (const stage of D.slotRewardStages) if (raw.slotRewardClaims?.[stage] === true) base.slotRewardClaims[stage] = true;
    base.rewardIndex = integer(raw.rewardIndex, 0);
    base.growthPoints = integer(raw.growthPoints, 0);
    base.sharedUpgrades = Object.fromEntries(Object.keys(D.statNames).map(stat=>[stat,integer(raw.sharedUpgrades?.[stat],0,999)]));
    base.sharedUpgradePointsSpent = integer(raw.sharedUpgradePointsSpent, Object.values(base.sharedUpgrades).reduce((sum,n)=>sum+n*(n+1)/2,0),2497500);
    for (const id of Object.keys(D.equipment)) base.inventory[id] = integer(raw.inventory?.[id], 0);
    if (raw.starterWeaponsMigrated !== true) {
      base.inventory.sword += 3; base.inventory.staff += 3;
    }
    if (raw.starterWeapons27Migrated !== true) {
      base.inventory.sword = Math.max(27,base.inventory.sword);
      base.inventory.staff = Math.max(27,base.inventory.staff);
    }
    // 廃止した移動装備は遠見の珠へ交換し、既存の所持数と割当を引き継ぐ。
    base.inventory.scope += integer(raw.inventory?.boots, 0);
    for (let stage = 1; stage <= base.unlocked; stage++) {
      const record = raw.stageRecords?.[stage];
      if (record && ['B', 'A', 'S'].includes(record.rank)) {
        base.stageRecords[stage] = { rank: record.rank, clears: Math.max(1, integer(record.clears, 1)) };
      }
      if (raw.rewardClaims && typeof raw.rewardClaims === 'object') {
        const claims = raw.rewardClaims[stage];
        if (Array.isArray(claims)) base.rewardClaims[stage] = [0, 1, 2].map(i => claims[i] === true);
      } else if (stage < base.unlocked || base.stageRecords[stage]) {
        base.rewardClaims[stage] = [true, true, true];
      }
      if (raw.growthCleared && typeof raw.growthCleared === 'object') {
        if (raw.growthCleared[stage] === true) base.growthCleared[stage] = true;
      } else if (stage < base.unlocked || base.stageRecords[stage]) base.growthCleared[stage] = true;
    }
    base.chapterThreeGiftsClaimed=raw.chapterThreeGiftsClaimed===true;
    if(!base.chapterThreeGiftsClaimed&&(base.stageRecords[41]||base.rewardClaims[41]?.[0]))grantChapterThreeGifts(base);
    // 旧クリア枠が取得済みなら、新しい攻略用装備の未所持分だけ一度補填する。
    if (raw.earlySpecialsMigrated !== true) {
      for (const [stage, id] of [[10, 'scope'], [12, 'pierce']]) {
        if (base.rewardClaims[stage]?.[0] && base.inventory[id] === 0) base.inventory[id] = 1;
      }
    }
    if (raw.chapterOneMigrated !== true) {
      for (let stage=1;stage<=20;stage++) {
        if (base.rewardClaims[stage]?.[0] || base.stageRecords[stage]) {
          if (D.slotRewardStages.includes(stage)) base.slotRewardClaims[stage] = true;
          const old = legacyStageRewards(stage), next = stageRewards(stage);
          for (let i=0;i<next.length;i++) if (base.rewardClaims[stage]?.[i] && old[i] !== next[i]) base.inventory[next[i]]++;
        }
      }
      base.slotBonus = Math.max(base.slotBonus,Math.floor(base.unlocked/10),Object.keys(base.slotRewardClaims).length);
    }
    // 旧版で第一幕までクリア済みなら、そのまま第二幕を解禁する。
    if (base.stageRecords[20] || base.rewardClaims[20]?.[0] || base.growthCleared[20]) base.unlocked=Math.max(base.unlocked,21);
    if(base.stageRecords[40]||base.rewardClaims[40]?.[0]||base.growthCleared[40])base.unlocked=Math.max(base.unlocked,41);
    if (!Array.isArray(raw.formation)) return base;
    // 壊れた保存値で駒の重なり・装備の過剰割当・HTML注入が起きないよう再構築する。
    const occupied = new Set(), ids = new Set(), serials = new Set(), assigned = {};
    base.formation = [];
    for (const source of raw.formation.slice(0, 27)) {
      if (!source || !Object.hasOwn(D.pieces, source.type)) continue;
      let serial = Math.max(1, integer(source.serial, base.formation.length + 1));
      while (serials.has(serial)) serial++;
      let id = typeof source.id === 'string' && /^ally-[a-z0-9-]+$/.test(source.id) ? source.id : `ally-${serial}`;
      if (ids.has(id)) id = `ally-${serial}`;
      while (ids.has(id)) id += '-copy';
      let x = source.x, y = source.y;
      if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || x > 8 || y < 6 || y > 8 || occupied.has(`${x},${y}`)) {
        const empty = [];
        for (let row = 6; row < 9; row++) for (let col = 0; col < 9; col++) if (!occupied.has(`${col},${row}`)) empty.push([col, row]);
        [x, y] = empty[0];
      }
      const equipment = [];
      for (const original of Array.isArray(source.equipment) ? source.equipment : []) {
        const item = original === 'boots' ? 'scope' : original;
        if (!Object.hasOwn(D.equipment, item) || equipment.includes(item) || D.usedSlots(equipment) + D.equipmentCost(item) > D.equipmentSlots(source.type, base.unlocked, base.slotBonus)) continue;
        if ((assigned[item] || 0) >= base.inventory[item]) continue;
        equipment.push(item); assigned[item] = (assigned[item] || 0) + 1;
      }
      const upgrades = Object.fromEntries(Object.keys(D.statNames).map(name => [name, integer(source.upgrades?.[name], 0, 999)]));
      const upgradePointsSpent = integer(source.upgradePointsSpent, Object.values(upgrades).reduce((sum, n) => sum + n, 0), 2497500);
      base.formation.push({ id, serial, type: source.type, x, y, equipment, upgrades, upgradePointsSpent });
      occupied.add(`${x},${y}`); ids.add(id); serials.add(serial);
    }
    base.nextSerial = Math.max(integer(raw.nextSerial, 1), ...base.formation.map(u => u.serial + 1), 1);
    if (raw.defaultSwordMigrated !== true) {
      for (const u of base.formation) {
        if (!u.equipment.some(id=>D.equipment[id].action==='attack') &&
            D.usedSlots(u.equipment)+1<=D.equipmentSlots(u.type,base.unlocked,base.slotBonus) &&
            (assigned.sword||0)<base.inventory.sword) {
          u.equipment.push('sword');assigned.sword=(assigned.sword||0)+1;
        }
      }
    }
    // 個別強化は実費を返却して共通強化へ振り直せるようにする。一度移行すれば再返却しない。
    for (const u of base.formation) {
      base.growthPoints += upgradeRefund(u);
      u.upgrades = Object.fromEntries(Object.keys(D.statNames).map(stat=>[stat,0]));
      u.upgradePointsSpent = 0;
    }
    return base;
  }

  function snapshot(game) {
    return game.allies.map(u => ({ id: u.id, serial: u.serial, type: u.type, x: u.x, y: u.y, equipment: [...u.equipment], upgrades: { ...u.upgrades }, upgradePointsSpent: upgradeRefund(u) }));
  }

  const quickTurnLimit = stage => stage>=50?18:stage>=46?16:stage>=42?14: stage >= 26 ? 12 : stage >= 22 ? 11 : stage === 21 ? 10 : stage >= 13 ? 8 : stage >= 9 ? 7 : stage === 8 ? 6 : stage >= 3 ? 5 : stage === 2 ? 4 : 3;
  const missionLabels = stage => stage <= 20 ? ['クリア', '全員生還'] : ['クリア', '全員生還', `${quickTurnLimit(stage)}ターン以内に${stage>=41?'敵王撃破':'敵全滅'}`];
  function clearRank(result) {
    if (!result || result.result !== 'win') return { rank: '—', count: 0, allSurvived: false, quick: false };
    const allSurvived = result.deployed > 0 && result.survivors === result.deployed;
    const timed = (result.stage || 1) >= 21;
    const quick = timed && result.victoryKind !== 'survival' && result.turns <= quickTurnLimit(result.stage);
    const count = 1 + Number(allSurvived) + Number(quick);
    return { rank: timed ? ['B', 'A', 'S'][count - 1] : allSurvived ? 'S' : 'B', count, allSurvived, quick };
  }

  function award(profile, game) {
    if (!game.result || game.result.result !== 'win' || game.rewardSettled) return null;
    const rank = clearRank(game.result), items = [];
    profile.rewardClaims ||= {}; profile.growthCleared ||= {}; profile.growthPoints ||= 0;
    const claims = profile.rewardClaims[game.stage] ||= [false, false, false];
    const conditions = [true, rank.allSurvived, rank.quick];
    const slots = stageRewards(game.stage).map((id, i) => {
      const status = claims[i] ? 'claimed' : conditions[i] ? 'new' : 'missing';
      if (status === 'new') {
        claims[i] = true; profile.inventory[id] = (profile.inventory[id] || 0) + 1;
        profile.rewardIndex++; items.push(id);
      }
      return { id, status, condition: missionLabels(game.stage)[i] };
    });
    const growth = profile.growthCleared[game.stage] ? 0 : game.stage>=46?4:game.stage>=41?3:1;
    profile.growthCleared[game.stage] = true; profile.growthPoints += growth;
    profile.slotRewardClaims ||= {};
    const equipmentSlot = D.slotRewardStages.includes(game.stage) && !profile.slotRewardClaims[game.stage] ? 1 : 0;
    if (equipmentSlot) { profile.slotRewardClaims[game.stage] = true; profile.slotBonus = (profile.slotBonus || 0) + 1; }
    profile.unlocked = Math.max(profile.unlocked, Math.min(D.maxStage, game.stage + 1));
    profile.stageRecords ||= {};
    const previous = profile.stageRecords[game.stage];
    profile.stageRecords[game.stage] = {
      rank: previous && ['B', 'A', 'S'].indexOf(previous.rank) > ['B', 'A', 'S'].indexOf(rank.rank) ? previous.rank : rank.rank,
      clears: (previous?.clears || 0) + 1
    };
    const introEquipment=game.stage===41?grantChapterThreeGifts(profile):[];
    game.rewardSettled = true;
    game.result.reward = { ...rank, introEquipment, count: items.length, items, slots, growth, equipmentSlot };
    return game.result.reward;
  }
  const costBonus = profile => profile.stageRecords?.[40] || profile.rewardClaims?.[40]?.[0] || profile.growthCleared?.[40] ? 1 : 0;
  const upgradeCost = (profile, stat) => (profile.sharedUpgrades?.[stat] || 0) + 1;
  const upgradeRefund = u => u?.upgradePointsSpent ?? Object.values(u?.upgrades || {}).reduce((sum, n) => sum + n, 0);
  function upgrade(profile, game, id, stat) {
    const u = game.unit(id);
    if (game.phase !== 'prepare' || !u || u.team !== 'ally' || !Object.hasOwn(D.statNames, stat)) return game.fail('強化は出陣準備中の味方に行えます。');
    profile.sharedUpgrades ||= {};
    if ((profile.sharedUpgrades[stat] || 0) >= 999) return game.fail('この能力は強化上限です。');
    const cost = upgradeCost(profile, stat);
    if (profile.growthPoints < cost) return game.fail(`強化ポイントが足りません。必要 ${cost}P / 所持 ${profile.growthPoints}P。ステージの初クリアで獲得できます。`);
    profile.sharedUpgradePointsSpent = (profile.sharedUpgradePointsSpent || 0) + cost;
    profile.growthPoints -= cost; profile.sharedUpgrades[stat] = (profile.sharedUpgrades[stat] || 0) + 1;
    game.sharedUpgrades = {...profile.sharedUpgrades};
    for (const ally of game.allies) {
      if (stat === 'hp') { ally.maxHp += 5; ally.hp += 5; } else ally[stat]++;
    }
    profile.formation = snapshot(game); game.message = `味方全体の${D.statNames[stat]}を強化しました。`;
    return true;
  }
  function resetSharedUpgrades(profile, game) {
    if (game.phase !== 'prepare') return game.fail('強化のリセットは出陣準備中に行えます。');
    const upgrades = profile.sharedUpgrades || {}, refund = profile.sharedUpgradePointsSpent || 0;
    if (!refund && !Object.values(upgrades).some(n=>n>0)) return game.fail('リセットする強化がありません。');
    for (const u of game.allies) for (const stat of Object.keys(D.statNames)) {
      const bonus = (upgrades[stat] || 0) * (stat === 'hp' ? 5 : 1);
      if (stat === 'hp') { u.maxHp -= bonus; u.hp = Math.min(u.hp,u.maxHp); }
      else u[stat] -= bonus;
    }
    profile.growthPoints += refund;
    profile.sharedUpgradePointsSpent = 0;
    profile.sharedUpgrades = {}; game.sharedUpgrades = {};
    profile.formation = snapshot(game);
    game.message = `全味方の強化をリセットし、${refund}Pを返却しました。`;
    return true;
  }
  const api = { chapterThreeStart, costBonus, defaults, chapterTwoStart, normalize, snapshot, clearRank, award, clone, rewardOrder, stageRewards, quickTurnLimit, missionLabels, upgrade, upgradeCost, upgradeRefund, resetSharedUpgrades, saveKey, legacyKey };
  if (typeof module !== 'undefined') module.exports = api;
  else root.BanjinProfile = api;
})(typeof window === 'undefined' ? globalThis : window);
