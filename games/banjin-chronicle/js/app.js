/* ブラウザ表示と入力。戦闘ルールはengine/rulesに委譲する。 */
(function () {
  'use strict';
  const D = window.BanjinData, R = window.BanjinRules, E = window.BanjinEngine;
  const P = window.BanjinProfile;
  const $ = id => document.getElementById(id);
  let profile = P.defaults();
  let storageAvailable = true;
  // 保存拒否や破損データでもゲーム自体は起動できる。
  try {
    const saved = localStorage.getItem(P.saveKey);
    if (saved) profile = P.normalize(JSON.parse(saved));
    else {
      const legacy = JSON.parse(localStorage.getItem(P.legacyKey) || '{}');
      profile = P.normalize({ ...P.defaults(Math.max(1, Math.min(999, Number.isInteger(legacy.unlocked) ? legacy.unlocked : 1))), earlySpecialsMigrated: false });
    }
  } catch { storageAvailable = false; }
  profile.stage = Math.min(profile.stage,D.maxStage);
  let game = new E.Game(profile.stage, profile.formation, profile.inventory, profile.unlocked, profile.sharedUpgrades, profile.slotBonus, P.costBonus(profile));
  game.nextSerial = profile.nextSerial;
  game.selected = null;
  let autoTimer = null;
  let shownResult = false;
  let resultTimer = null;
  let stagePage = 0;
  const stagesPerPage = 12;
  const mobileLayout = window.matchMedia('(max-width:1000px)');
  const debugMode = location.hostname === '127.0.0.1';
  let debugBattle = null;
  if (debugMode) document.querySelector('.prototype').textContent = 'DEBUG · 初クリアをサーバー保存';
  function startChapterTwo({dryRun=false}={}) {
      if(game.phase!=='prepare')return {ok:false,errors:['出陣準備中だけ実行できます。']};
      const next=P.chapterTwoStart(),backupKey=`${P.saveKey}.before-chapter-two-debug`;
      if(dryRun)return {ok:true,stage:21,inventory:next.inventory,growthPoints:20,slotBonus:4,backupKey};
      try{
        if(!localStorage.getItem(backupKey))localStorage.setItem(backupKey,JSON.stringify(profile));
        localStorage.setItem(P.saveKey,JSON.stringify(next));
      }catch{return {ok:false,errors:['バックアップまたはセーブを保存できないため、適用しませんでした。']};}
      profile=next;loadStage(21);return {ok:true,stage:21,backupKey,growthPoints:20,slotBonus:4};
  }
  function restoreChapterTwoBackup() {
      if(game.phase!=='prepare')return {ok:false,errors:['出陣準備中だけ実行できます。']};
      try{
        const saved=localStorage.getItem(`${P.saveKey}.before-chapter-two-debug`);
        if(!saved)return {ok:false,errors:['バックアップがありません。']};
        const next=P.normalize(JSON.parse(saved));localStorage.setItem(P.saveKey,JSON.stringify(next));
        profile=next;loadStage(Math.min(next.stage,D.maxStage));return {ok:true,stage:profile.stage};
      }catch{return {ok:false,errors:['バックアップの復元に失敗しました。']};}
  }
  function startChapterThree({dryRun=false}={}) {
      if(game.phase!=='prepare')return {ok:false,errors:['出陣準備中だけ実行できます。']};
      const next=P.chapterThreeStart(),backupKey=`${P.saveKey}.before-chapter-three`;
      if(dryRun)return {ok:true,stage:41,inventory:next.inventory,growthPoints:40,slotBonus:6,backupKey};
      try{
        if(!localStorage.getItem(backupKey))localStorage.setItem(backupKey,JSON.stringify(profile));
        localStorage.setItem(P.saveKey,JSON.stringify(next));
      }catch{return {ok:false,errors:['バックアップまたはセーブを保存できないため、適用しませんでした。']};}
      profile=next;loadStage(41);return {ok:true,stage:41,backupKey,growthPoints:40,slotBonus:6};
  }
  function restoreChapterThreeBackup() {
      if(game.phase!=='prepare')return {ok:false,errors:['出陣準備中だけ実行できます。']};
      try{
        const saved=localStorage.getItem(`${P.saveKey}.before-chapter-three`);
        if(!saved)return {ok:false,errors:['バックアップがありません。']};
        const next=P.normalize(JSON.parse(saved));localStorage.setItem(P.saveKey,JSON.stringify(next));
        profile=next;loadStage(Math.min(next.stage,D.maxStage));return {ok:true,stage:profile.stage};
      }catch{return {ok:false,errors:['バックアップの復元に失敗しました。']};}
  }
  if (debugMode) window.banjinDebug = Object.freeze({
    startChapterTwo, startChapterThree, restoreChapterThreeBackup,
    restoreChapterTwoBackup,
    async list() {
      try {
        const response=await fetch('/api/debug/first-clear');
        if(!response.ok) throw new Error('Read failed');
        return await response.json();
      } catch { return {ok:false,errors:['記録一覧を取得できません。開発サーバーを再起動してください。']}; }
    },
    async load(stage,{dryRun=false}={}) {
      if(game.phase!=='prepare') return {ok:false,errors:['出陣準備中だけ実行できます。']};
      if(!Number.isInteger(stage)||stage<1||stage>999) return {ok:false,errors:['ステージ番号は1〜999の整数で指定してください。']};
      const currentGame=game, before=JSON.stringify(profile);
      let record;
      try {
        const response=await fetch(`/api/debug/first-clear?stage=${stage}`);
        if(!response.ok) return {ok:false,errors:[response.status===404?'攻略記録がありません。':'記録を取得できません。開発サーバーを再起動してください。']};
        record=await response.json();
      } catch { return {ok:false,errors:['攻略記録の読み込みに失敗しました。']}; }
      if(game!==currentGame||game.phase!=='prepare'||JSON.stringify(profile)!==before) return {ok:false,errors:['読み込み中に状態が変わりました。再実行してください。']};
      if(record.stage!==stage) return {ok:false,errors:['記録のステージ番号が一致しません。']};
      const plan=window.BanjinDebugPlanner.plan(profile,record);
      if(!plan.ok||dryRun) return plan;
      profile.formation=plan.formation;profile.growthPoints=plan.growthPoints;profile.nextSerial=plan.nextSerial;
      profile.sharedUpgrades=plan.sharedUpgrades;profile.sharedUpgradePointsSpent=plan.sharedUpgradePointsSpent;
      loadStage(stage);
      return {ok:true,stage,cost:plan.cost,upgradePoints:plan.upgradePoints};
    }
  });
  async function saveDebugClear(endedGame, battle) {
    if (!debugMode || !battle?.firstClear || endedGame.result.result !== 'win') return;
    const record = {stage:endedGame.stage,departure:battle.departure,moves:battle.moves,result:JSON.parse(JSON.stringify(endedGame.result))};
    endedGame.debugSave = '攻略記録をサーバーへ保存中…';
    for (let attempt=0;attempt<3;attempt++) {
      try {
        const response = await fetch('/api/debug/first-clear',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(record)});
        if (!response.ok) throw new Error('Save failed');
        const saved = await response.json();
        endedGame.debugSave = `攻略記録を${saved.replaced ? '上書き保存' : '保存'}：${saved.file}`;
        break;
      } catch { endedGame.debugSave = '攻略記録の保存に失敗。node tools/serve.cjsで起動しているか確認してください。'; }
    }
    if (game === endedGame && $('result-dialog').open) showResult();
  }
  function syncLayout() {
    const equipment = $('equipment-dialog');
    equipment.close();
    if (mobileLayout.matches) document.body.append(equipment);
    else document.querySelector('.right-panel').prepend(equipment);
    const panel = $('army-panel');
    if (mobileLayout.matches) $('mobile-army-host').append(panel);
    else { $('army-dialog').close(); document.querySelector('.game-layout').prepend(panel); }
    $('log-disclosure').open = !mobileLayout.matches;
  }
  function openArmy() {
    if (!mobileLayout.matches || resultTimer) return;
    stopAuto(); renderStatus();
    if (!$('army-dialog').open) $('army-dialog').showModal();
  }

  function stopAuto() {
    if (autoTimer) clearInterval(autoTimer);
    autoTimer = null;
  }
  function startAuto() {
    if (!game.duel && !autoTimer && game.phase === 'battle' && !document.hidden && !$('help-dialog').open) {
      autoTimer = setInterval(() => { game.advance(); render(); }, 1300);
    }
  }
  function saveProgress() {
    try { localStorage.setItem(P.saveKey, JSON.stringify(profile)); }
    catch { storageAvailable = false; }
  }
  function loadStage(stage) {
    if (!Number.isInteger(stage) || stage < 1 || stage > Math.min(profile.unlocked,D.maxStage)) return;
    if (drag) finishDrag({ pointerId: drag.pointerId }, true);
    stopAuto();
    if (resultTimer) clearTimeout(resultTimer);
    resultTimer = null;
    window.BanjinEffects.clear($('board'));
    $('result-dialog').close();
    $('equipment-dialog').close();
    $('status-dialog').close();
    $('stage-dialog').close();
    $('reset-dialog').close();
    $('army-dialog').close();
    profile.stage = stage;
    game = new E.Game(stage, profile.formation, profile.inventory, profile.unlocked, profile.sharedUpgrades, profile.slotBonus, P.costBonus(profile));
    game.nextSerial = profile.nextSerial;
    game.selected = null;
    debugBattle = null;
    shownResult = false;
    saveProgress();
    render();
  }

  function renderStages() {
    const total = D.maxStage;
    const pages = Math.ceil(total / stagesPerPage);
    stagePage = Math.max(0, Math.min(stagePage, pages - 1));
    $('player-cost-limit').textContent = game.limit;
    $('highest-stage').textContent = `Lv.${profile.unlocked} / 報酬の装備枠 +${profile.slotBonus}`;
    $('stage-grid').innerHTML = Array.from({ length: Math.min(stagesPerPage, total - stagePage * stagesPerPage) }, (_, i) => {
      const stage = stagePage * stagesPerPage + i + 1;
      const locked = stage > profile.unlocked;
      const record = profile.stageRecords[stage];
      const claims = profile.rewardClaims[stage] || [];
      const loot = (stage===41?('第三幕贈呈 · 雷鳴の護符・防貫の大盾：'+(profile.chapterThreeGiftsClaimed?'取得済み':'未取得')+'<br>'):'') + (D.slotRewardStages.includes(stage) ? `クリア · 全駒の装備枠 +1：${profile.slotRewardClaims[stage] ? '取得済み' : '未取得'}<br>` : '') + P.stageRewards(stage).map((id, slot) => `${P.missionLabels(stage)[slot]} · ${D.equipment[id].name}：${claims[slot] ? '取得済み' : '未取得'}`).join('<br>');
      const cleared = stage < profile.unlocked || Boolean(record);
      return `<button class="stage-card ${cleared ? 'cleared' : ''} ${stage === game.stage ? 'current' : ''}" data-stage="${stage}" ${locked ? 'disabled' : ''} aria-label="Stage ${stage} ${locked ? '未解禁' : cleared ? 'クリア済み・再挑戦' : '挑戦可能'}"><span class="stage-card-status">${stage===50?'第三幕決戦 · ':stage === D.bossStage ? '第二幕決戦 · ' : stage===20 ? '第一幕決戦 · ' : stage>=41?'王取り · ':D.kingDefense(stage) ? '王護衛 · ' : ''}${locked ? '未解禁' : cleared ? '✓ クリア済み' : '挑戦可能'}</span><strong><small>STAGE</small>${String(stage).padStart(2, '0')}</strong><span>敵 ${E.enemyArmy(stage).length}体${D.kingDefense(stage) ? ` · ${D.castleFormation(stage)?.name || '初期布陣'}` : ''}</span><span class="stage-loot">${loot}</span><span class="stage-card-footer">${locked ? `Stage ${stage - 1}クリアで解禁` : record ? `最高 RANK ${record.rank}` : cleared ? '装備を集める' : '新たな盤陣へ'}</span></button>`;
    }).join('');
    $('stage-prev').disabled = stagePage === 0;
    $('stage-next').disabled = stagePage === pages - 1;
    $('stage-page').textContent = `${stagePage + 1} / ${pages}`;
  }

  function openStages() {
    stopAuto();
    $('army-dialog').close();
    if (game.phase === 'ended') loadStage(game.stage);
    renderStatus();
    stagePage = Math.floor((game.stage - 1) / stagesPerPage);
    renderStages(); $('stage-dialog').showModal();
  }

  function saveFormation() {
    // 戦闘後の生存者・移動先ではなく、準備時の全駒と配置を保存する。
    if (game.phase !== 'prepare') return;
    profile.formation = P.snapshot(game);
    profile.nextSerial = game.nextSerial;
    saveProgress();
  }

  function renderRoster() {
    $('cost').textContent = game.cost;
    $('cost-limit').textContent = game.limit;
    $('player-level-info').textContent = `プレイヤー Lv.${profile.unlocked} · 報酬の装備枠 +${profile.slotBonus}（Stage 5・10・15・20・30・40・50のクリア報酬）`;
    $('cost-fill').style.width = `${Math.min(100, game.cost / game.limit * 100)}%`;
    $('roster').innerHTML = D.roster.map(type => {
      const p = D.pieces[type], count = game.allies.filter(u => u.type === type).length;
      return `<button class="roster-item ${count ? 'active' : ''}" data-roster="${type}" ${game.phase !== 'prepare' || count >= D.unitLimits[type] ? 'disabled' : ''} aria-label="${p.name}を1体追加"><span class="roster-symbol">${p.glyph}</span><span class="roster-name">${p.name} <small>COST ${p.cost} · ${count}/${D.unitLimits[type]}体</small></span><span class="roster-check">＋</span></button>`;
    }).join('');
    $('deployed-list').innerHTML = game.allies.map(u => {
      const s = R.stats(u);
      return `<tr><td><button class="status-unit ${u.id === game.selected ? 'active' : ''}" data-unit="${u.id}" aria-pressed="${u.id === game.selected}">${u.glyph} ${u.name} #${u.serial}</button></td><td>${u.x + 1}列・${9 - u.y}行</td><td>${u.hp}/${u.maxHp}</td><td>${s.atk}</td><td>${s.def}</td><td>${s.matk}</td><td>${s.mdef}</td><td><span class="status-equipment">${u.equipment.map(id => D.equipment[id].name).join('、') || '装備なし'}</span><small>${D.usedSlots(u.equipment)}/${u.slots} 枠</small></td></tr>`;
    }).join('') || '<tr><td colspan="8" class="muted">駒を追加してください。</td></tr>';
    $('placement-unlock').className = game.placementUnlocked ? 'unlocked' : '';
    $('placement-unlock').innerHTML = '<span>✓ 初期配置の変更</span><span>Stage 1から</span>';
    $('movement-unlock').className = game.movementUnlocked ? 'unlocked' : '';
    $('movement-unlock').innerHTML = `<span>${game.movementUnlocked ? '✓' : '◇'} 戦闘中の移動</span><span>${game.movementUnlocked ? '解禁済み' : '第3幕で予定'}</span>`;
    $('stage-select').innerHTML = Array.from({ length: Math.min(profile.unlocked,D.maxStage) }, (_, i) => `<option value="${i + 1}" ${game.stage === i + 1 ? 'selected' : ''}>Stage ${i + 1}</option>`).join('');
  }

  function renderBoard() {
    const u = game.unit(game.selected);
    const enemyPlans = game.phase === 'ended' ? [] : game.enemyPlan();
    const planned = new Map(enemyPlans.map(plan => [plan.id,plan]));
    const ranges = Object.fromEntries(['attack', 'buff', 'debuff', 'heal'].map(action => [action, new Set()])), moves = new Set();
    if (u) {
      for (const item of E.actionsFor(u)) for (const pos of R.actionRange(u, item, game.units)) ranges[item.action].add(R.key(...pos));
      if (u.team === 'ally' && game.phase === 'battle' && game.battleStep === 'ally' && game.movementUnlocked && !game.allyMoved && u.moved < 1) {
        for (const pos of game.legalMoves(u)) moves.add(R.key(...pos));
      }
    }
    const cells = [];
    for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) {
      const occupant = R.at(game.units, x, y), k = R.key(x, y);
      const placeable = game.phase === 'prepare' && game.placementUnlocked && u?.team === 'ally' && y >= 6 && !occupant;
      const rangeActions = Object.keys(ranges).filter(action => ranges[action].has(k));
      const rangeFrames = rangeActions.map(action => `<span class="range-frame range-${action}" aria-hidden="true"></span>`).join('');
      const classes = ['cell', y <= 2 ? 'enemy-zone' : y >= 6 ? 'ally-zone' : '', rangeActions.length ? 'in-range' : '', moves.has(k) ? 'movable' : '', placeable ? 'movable placeable' : '', occupant?.id === game.selected ? 'selected' : ''];
      let piece = '';
      if (occupant) {
        const glyph = occupant.promoted ? D.promotion[occupant.type] : occupant.glyph;
        piece = `<span class="piece ${occupant.equipment.includes('bulwark')?'shielded':''} ${occupant.team} ${occupant.promoted ? 'promoted' : ''} ${occupant.boss ? 'boss' : ''}"><span class="piece-glyph">${glyph}</span>${occupant.equipment.includes('bulwark')?'<span class="shield-marker" aria-hidden="true">盾</span>':''}<span class="piece-hp">${occupant.hp}</span><span class="hp-bar"><i style="width:${occupant.hp / occupant.maxHp * 100}%"></i></span>${occupant.effects.length || occupant.boss ? '<span class="piece-marker">✦</span>' : ''}</span>`;
      }
      const event = occupant && game.events.filter(e => e.id === occupant.id && e.kind !== 'damage').at(-1);
      const plan = occupant && planned.get(occupant.id);
      const forecast = plan ? plan.breakthrough ? ' 次に自陣突破' : plan.to.x === x && plan.to.y === y ? ' 次は待機' : ` 次は${plan.to.x+1}列 ${9-plan.to.y}行へ移動` : '';
      const label = `${x + 1}列 ${9 - y}行 ${occupant ? `${occupant.team === 'ally' ? '味方' : '敵'} ${occupant.name}${occupant.equipment.includes('bulwark')?' 防貫の大盾':''}${occupant.serial ? ` #${occupant.serial}` : ''}${occupant.promoted ? ' 成り' : ''} HP ${occupant.hp}` : '空きマス'}${moves.has(k) ? ' 移動可能' : ''}${forecast}`;
      // 操作ボタンはマスの選択ボタンと並べ、ボタンの入れ子を避ける。
      const settings = occupant?.team === 'ally' && game.phase === 'prepare' ? `data-open-equipment="${occupant.id}" aria-haspopup="dialog"` : '';
      cells.push(`<div class="${classes.join(' ')}"><button class="cell-select" data-x="${x}" data-y="${y}" aria-label="${label}" ${settings} ${occupant ? `aria-pressed="${occupant.id === game.selected}"` : ''}>${piece}</button>${rangeFrames}${event && event.kind !== 'damage' ? `<span class="effect-float ${event.kind}">${event.text}</span>` : ''}</div>`);
    }
    // 描画更新でも進行中の攻撃・消滅演出を最後まで残す。
    $('board').querySelectorAll('.cell').forEach(cell => cell.remove());
    $('board').insertAdjacentHTML('afterbegin', cells.join(''));
    $('board').querySelector('.enemy-plan-layer')?.remove();
    const arrows = enemyPlans.map(plan => {
      const x = plan.from.x*100+50,y = plan.from.y*100+50,tx = plan.to.x*100+50,ty = plan.to.y*100+50;
      const dx=tx-x,dy=ty-y,len=Math.hypot(dx,dy);
      const shape = len ? `<line x1="${x+dx/len*25}" y1="${y+dy/len*25}" x2="${tx-dx/len*18}" y2="${ty-dy/len*18}" marker-end="url(#enemy-plan-arrow)"/>` : `<text x="${x+30}" y="${y-25}">${plan.breakthrough ? '↓' : '・'}</text>`;
      return `<g data-enemy-plan="${plan.id}" data-from-x="${plan.from.x}" data-from-y="${plan.from.y}" data-to-x="${plan.to.x}" data-to-y="${plan.to.y}" class="${u?.id === plan.id ? 'active' : ''}">${shape}</g>`;
    }).join('');
    if (arrows) $('board').insertAdjacentHTML('beforeend', `<svg class="enemy-plan-layer" viewBox="0 0 900 900" aria-hidden="true"><defs><marker id="enemy-plan-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 Z"/></marker></defs>${arrows}</svg>`);
    const effectDuration = window.BanjinEffects.render($('board'), game.events, game.units);
    $('enemy-count').textContent = `敵 ${game.enemies.length}`;
    $('ally-count').textContent = `味方 ${game.allies.length}`;
    $('breakthrough').hidden = !(!game.duel && u && game.phase === 'battle' && game.battleStep === 'ally' && game.movementUnlocked && R.canBreakthrough(u) && u.moved < 1);
    // アニメーションは新しい戦闘イベントだけに表示する。
    game.events = [];
    return effectDuration;
  }

  function renderDetail() {
    if (!mobileLayout.matches) $('equipment-dialog').open = !!game.unit(game.selected);
    const detailScroll = $('unit-detail').querySelector('.unit-equipment-scroll')?.scrollTop || 0;
    const focusedEquipment = $('equipment-dialog').open && document.activeElement?.dataset.equipment;
    const focusedUpgrade = $('equipment-dialog').open && document.activeElement?.dataset.upgrade;
    const u = game.unit(game.selected) || game.unit('ally-rook') || game.allies[0];
    if (!u) { $('unit-detail').innerHTML = '<p class="muted">盤面の駒を選ぶと、能力と装備を確認できます。</p>'; return; }
    const s = R.stats(u);
    const glyph = u.promoted ? D.promotion[u.type] : u.glyph;
    const canEquip = game.phase === 'prepare' && u.team === 'ally';
    const equipment = Object.entries(D.equipment).filter(([id]) => u.team === 'ally' || u.equipment.includes(id)).map(([id, item]) => {
      const active = u.equipment.includes(id);
      const available = game.available(id), owned = game.inventory[id] || 0;
      return `<button class="equipment-item ${active ? 'active' : ''}" data-equipment="${id}" title="${item.description}" aria-label="${item.name}：${item.description} 未使用 ${available} / 所持 ${owned}" aria-pressed="${active}" ${canEquip ? '' : 'disabled'}><span class="equipment-icon">${item.icon}</span><span class="equipment-name">${item.name}<small>${item.kind} · ${D.equipmentCost(id)}枠使用 · ${item.description}</small></span><span class="equipment-stock" data-stock="${id}">${available}/${owned}<small>未使用 / 所持</small></span><span class="equipment-check">${active ? '✓' : '＋'}</span></button>`;
    }).join('');
    $('unit-detail').innerHTML = `<div class="unit-heading"><span class="detail-symbol ${u.team}">${glyph}</span><div><h3>${u.name}${u.promoted ? '・成' : ''}</h3><small>${u.team === 'ally' ? '味方' : '敵'} / COST ${u.cost}${game.phase === 'battle' && u.team === 'ally' ? ` / 移動 ${u.moved}/1` : ''}</small></div></div><p class="unit-role">${u.role}${u.promoted ? '。成りによる追加範囲が有効。' : ''}</p><div class="detail-hp"><span>HP</span><strong>${u.hp} <span class="muted">/ ${u.maxHp}</span></strong></div><div class="detail-hp-track"><i style="width:${u.hp / u.maxHp * 100}%"></i></div><div class="stats"><div>物攻 <b>${s.atk}</b></div><div>物防 <b>${s.def}</b></div><div>魔攻 <b>${s.matk}</b></div><div>魔防 <b>${s.mdef}</b></div></div><div class="equipment-heading">装備 <span>${D.usedSlots(u.equipment)} / ${u.slots} 枠</span></div><div class="equipment-grid">${equipment || '<p class="muted tiny">装備なし</p>'}</div><p class="default-action">${E.actionsFor(u).some(item => item.action === 'attack') ? '' : '攻撃装備なし：攻撃できません。<br>'}${E.actionsFor(u).map(item => item.description).join('<br>')}${u.equipment.filter(id => D.equipment[id].action === 'special').map(id => `<br>${D.equipment[id].description}`).join('')}</p>`;
    if (u.team === 'ally') {
      $('unit-detail').querySelector('h3').textContent += ` #${u.serial}`;
      const growth = document.createElement('section'); growth.className = 'growth-panel';
      growth.innerHTML = `<div class="equipment-heading">味方全体の強化 <span>残り ${profile.growthPoints} P</span></div><p class="muted tiny">全味方・追加する駒に共通で適用。初クリアで第一・二幕は1P、第三幕前半は3P・後半は4P。同じ能力は1P→2P→3P…と必要量が増えます。駒を外しても強化は残ります。</p><div class="growth-buttons">${Object.entries(D.statNames).map(([stat, name]) => `<button class="secondary" data-upgrade="${stat}" ${!canEquip || profile.growthPoints < P.upgradeCost(profile, stat) || (profile.sharedUpgrades?.[stat] || 0) >= 999 ? 'disabled' : ''}>${name} +${stat === 'hp' ? 5 : 1}<small>必要 ${P.upgradeCost(profile, stat)}P · 強化 ${profile.sharedUpgrades?.[stat] || 0}回</small></button>`).join('')}</div>`;
      growth.insertAdjacentHTML('beforeend', `<div class="growth-reset"><button class="secondary" id="reset-shared-upgrades" ${!canEquip || !(profile.sharedUpgradePointsSpent || Object.values(profile.sharedUpgrades || {}).some(n=>n>0)) ? 'disabled' : ''}>強化を全リセット</button><p id="reset-shared-confirm" class="muted tiny" hidden>全味方の強化を解除し、使用済み ${profile.sharedUpgradePointsSpent || 0}Pを返却します。もう一度「強化を全リセット」を押すと確定します。<button class="quiet" id="cancel-reset-shared">キャンセル</button></p></div>`);
      $('unit-detail').append(growth);
      if (canEquip) $('unit-detail').insertAdjacentHTML('beforeend', '<div class="unit-remove"><button class="secondary" id="remove-unit">この駒を編成から外す</button><p class="muted tiny" id="remove-confirm" hidden>装備は戻ります。味方全体の強化は残ります。<button class="quiet" id="cancel-remove-unit">キャンセル</button></p></div>');
    }
    const summary = document.createElement('div'); summary.className = 'unit-summary';
    const equipped = document.createElement('div'); equipped.className = 'equipped-summary';
    const count = document.createElement('strong'); count.textContent = `使用枠 ${D.usedSlots(u.equipment)} / ${u.slots} 枠`;
    const names = document.createElement('span'); names.textContent = u.equipment.length ? u.equipment.map(id => D.equipment[id].name).join('・') : '装備なし';
    equipped.append(count, names);
    $('unit-detail').querySelector('.unit-heading').append(equipped);
    for (const selector of ['.unit-heading', '.detail-hp', '.detail-hp-track', '.stats']) summary.append($('unit-detail').querySelector(selector));
    const scroll = document.createElement('div'); scroll.className = 'unit-equipment-scroll';
    scroll.append(...$('unit-detail').childNodes);
    $('unit-detail').append(summary, scroll); scroll.scrollTop = detailScroll;
    $('equipment-notice').textContent = game.message;
    if (focusedEquipment) $('unit-detail').querySelector(`[data-equipment="${focusedEquipment}"]`)?.focus({ preventScroll: true });
    if (focusedUpgrade) $('unit-detail').querySelector(`[data-upgrade="${focusedUpgrade}"]:not(:disabled)`)?.focus({ preventScroll: true });
  }

  function renderStatus() {
    const titles = ['はじまりの布陣', '陣形を組み替えよ', '装備を活かして迎え撃て'];
    const castle=D.castleFormation(game.stage);
    $('chapter-number').textContent = String(game.stage).padStart(2, '0');
    $('stage-title').textContent = game.duel ? ['第三幕開幕 — 王を討て','盾の門番','雷鳴の迎撃','二枚盾の城門','斜線を断つ城','跳躍の術陣','貫く槍の陣','癒しの本丸','呪陣の最終防壁','第三幕決戦 — 大将を討て'][game.stage-41] : game.stage===40 ? '第二幕の決戦 — 王を守り抜け' : game.stage===21 ? '第二幕開幕 — 同じ二十枚、変わる狙い' : game.kingDefense ? game.stage>=36?'王城への総攻撃':game.stage>=31?'迫る前衛部隊':game.stage>=26?'左右を変える包囲陣':'王を狙う二十枚' : game.stage===20 ? '第一幕の締めくくり — 二十枚の布陣' : titles[game.stage-1] || '新たなる盤陣';
    if(castle)$('stage-title').textContent=`第二幕 — ${castle.name}`;
    $('turn').textContent = String(game.turn).padStart(2, '0');
    $('enemy-ai-hint').textContent = game.phase === 'ended' ? '' : game.phase === 'battle' && game.battleStep === 'ally' ? '進軍AI · 矢印は仮予告。味方の攻撃後に更新します。' : '進軍AI · 前進しながら攻撃と生存を優先。矢印は次の移動。';
    if (game.stage <= 3 && game.phase !== 'ended') $('enemy-ai-hint').textContent = '入門戦 · 敵は直進。Stage4以降も前進を優先します。';
    if(game.kingDefense && game.phase!=='ended') $('enemy-ai-hint').textContent=game.battleStep==='ally'&&game.phase==='battle'?'王狙いAI · 矢印は仮予告。味方の攻撃後に更新します。':'王狙いAI · 王への攻撃経路を探索。迂回・横移動・後退も使います。';
    if(castle&&game.turn===1&&game.phase!=='ended')$('enemy-ai-hint').textContent=game.phase==='battle'&&game.battleStep==='ally'?`囲い「${castle.name}」が完成。次から王を狙います。矢印は仮予告。`:`初手で${castle.name}を組みます。矢印は囲い完成への移動。`;
    $('mission-hint').textContent = `報酬ミッション：${P.missionLabels(game.stage).join(' / ')}`;
    if(game.kingDefense) $('mission-hint').textContent=`敵全滅、または王将を守って${D.defenseTurns}ターン終了で勝利。王将撃破で敗北。${$('mission-hint').textContent}`;
    if(game.kingDefense&&game.phase==='battle') $('mission-hint').textContent=`防衛 ${Math.min(game.turn-1,D.defenseTurns)}/${D.defenseTurns}ターン完了。${$('mission-hint').textContent}`;
    $('status-button').hidden = game.phase !== 'prepare';
    $('turn-label').hidden = game.phase === 'prepare';
    $('phase-label').textContent = game.phase === 'prepare' ? '出陣準備' : game.phase === 'battle' ? '交戦中' : game.result.result === 'win' ? '勝利' : '敗北';
    $('phase-hint').textContent = game.phase === 'prepare' ? '編成と装備を整えよう' : game.phase === 'battle' ? game.battleStep === 'enemy' ? '敵移動 → 敵攻撃' : game.movementUnlocked ? '味方移動 → 味方攻撃' : '味方攻撃' : '戦況を振り返ろう';
    $('primary-button').innerHTML = game.phase === 'prepare' ? '出陣する <span>→</span>' : game.phase === 'battle' ? game.battleStep === 'enemy' ? '敵の移動・攻撃 <span>→</span>' : '味方攻撃・ターン終了 <span>→</span>' : '戦闘結果を見る <span>→</span>';
    $('primary-button').disabled = Boolean(resultTimer) || (game.phase === 'prepare' && (!game.allies.length || game.cost > game.limit || game.overUnitLimit || game.requiresKing && !game.allies.some(u=>u.type==='king')));
    $('reset-save-button').disabled = Boolean(resultTimer);
    $('auto-button').hidden = game.phase !== 'battle'||game.duel;
    $('auto-button').disabled=game.duel;
    $('auto-button').textContent = autoTimer ? 'Ⅱ 一時停止' : '▶ 自動進行';
    $('command-hint').textContent = game.phase === 'prepare' ? '編成と初期配置を整えて出陣。戦闘は自動で進みます。' : game.phase === 'battle' ? autoTimer ? game.movementUnlocked ? '自動進行中。駒を動かすときは一時停止できます。' : '自動進行中。配置した駒が敵を迎え撃ちます。' : game.battleStep === 'enemy' ? '一時停止中。敵の行動を進めるか、自動進行を再開。' : game.movementUnlocked ? '味方を選び緑の点へ移動。その後、味方攻撃でターンを終了。' : '一時停止中。味方攻撃を進めるか、自動進行を再開。' : game.result.reason;
    $('notice').textContent = game.message || (game.phase === 'prepare' && game.overUnitLimit ? '駒数の上限を超えています。歩兵9体、飛車・角・王1体、その他2体までに調整してください。' : game.phase === 'prepare' && game.cost > game.limit ? '保存編成がコスト上限を超えています。駒を外して調整してください。' : !storageAvailable ? '進行を保存できません。この画面を開いている間はプレイを続けられます。' : '');
    if(game.duel){
      $('enemy-ai-hint').textContent='王取りAI · 敵も1手番に1体を移動。味方の行動後に予告を更新します。';
      $('mission-hint').textContent=`敵王のHPを0にすると勝利。味方王の撃破で敗北。12ターン防衛勝利なし。S条件：全員生還・${P.quickTurnLimit(game.stage)}ターン以内の敵王撃破。初クリア強化＋${game.stage>=46?4:3}P。`;
      $('auto-button').disabled=true;
      if(game.phase==='battle')$('primary-button').disabled=true;
      $('phase-hint').textContent=game.phase==='prepare'?'王を編成し、攻める準備をしよう':game.phase==='battle'?game.battleStep==='ally'?'味方1体を移動 → 双方の攻撃まで自動処理':'敵1体移動 → 敵全員攻撃':'戦況を振り返ろう';
      if(game.phase==='battle')$('primary-button').textContent='味方を1体移動してください';
      $('command-hint').textContent=game.phase==='prepare'?'味方1体の移動で双方の攻撃まで進む王取り戦です。':game.phase==='battle'?'味方を選び、緑の点へ移動すると双方の攻撃まで進みます。待機はできません。':game.result.reason;
    }
    if(game.phase==='prepare'&&game.requiresKing&&!game.allies.some(u=>u.type==='king')) $('notice').textContent='この戦いは王将の編成が必須です。「＋」から王を1体編成してください。';
    if (game.phase === 'prepare') $('command-hint').textContent = mobileLayout.matches ? 'タップで選択、長押しで設定。移動はドラッグ。別のマスで選択解除。' : '駒をドラッグして配置。クリックで選択し、右側で設定。空きマスで選択解除。';
    $('board-input-guide').textContent = mobileLayout.matches ? '駒をタップで選択・長押しで設定。ドラッグで移動。別の駒や盤面をタップで選択解除。' : '駒をドラッグして移動。クリックで選択し右側で設定。別の駒で切替、空きマスで選択解除。';
    if(game.duel&&game.phase==='battle')$('board-input-guide').textContent='味方を選んで緑の点をタップ、またはドラッグで移動。1手番に1体。角・飛車・香車は射線上を制限なく移動。';
    $('battle-log').innerHTML = game.logs.map(log => `<div class="log-entry ${log.kind}"><span>${String(log.turn).padStart(2, '0')}</span><p>${log.text}</p></div>`).join('');
  }

  function showResult() {
    const win = game.result.result === 'win';
    $('result-eyebrow').textContent = win ? game.stage === D.bossStage || game.stage===50 ? 'CAMPAIGN CLEAR' : 'STAGE CLEAR' : 'DEFEAT';
    $('result-seal').textContent = win ? '勝' : '敗';
    $('result-title').textContent = win ? game.stage===50?'第三幕、王を討ち取った。':game.duel ? '敵王を討ち取った。' : game.stage === D.bossStage ? '第二幕、王を守り抜いた。' : game.stage===20 ? '第一幕、盤陣を守り抜いた。' : '盤陣を守り抜いた。' : 'この一戦を、次の一手に。';
    $('result-reason').textContent = game.result.reason;
    const reward = game.result.reward;
    $('result-rewards').innerHTML = reward ? `<strong>RANK ${reward.rank} · 装備 ${reward.count+(reward.introEquipment?.length||0)}個獲得</strong><p>装備報酬は合計${reward.slots.length}枠。今回の強化ポイント +${reward.growth}P${reward.equipmentSlot ? ' / 全駒の装備枠 +1' : ''}</p><small>${game.result.turns}ターン / 生還 ${game.result.survivors}/${game.result.deployed}体 / 累計被ダメ ${game.result.damageTaken}</small><ul>${reward.slots.map(slot => `<li class="reward-slot ${slot.status}"><span>${D.equipment[slot.id].icon} ${D.equipment[slot.id].name}</span><b>${{ claimed: '取得済み', new: '新規に取得', missing: '未取得' }[slot.status]}</b><small>${slot.condition}</small></li>`).join('')}</ul>` : '<p class="muted tiny">敗北時の装備報酬はありません。</p>';
    $('result-unlock').textContent = win ? `Stage ${game.stage + 1} 解禁 — 新たな敵軍が待っています。` : '編成や装備を変えて、再び挑みましょう。';
    if(win&&game.stage===50)$('result-unlock').textContent='第三幕クリア！ 王取りの十戦を制しました。';
    $('result-next').hidden = !win || game.stage >= D.maxStage;
    let debugNotice = $('debug-save-notice');
    if (!debugNotice) { debugNotice=document.createElement('p');debugNotice.id='debug-save-notice';debugNotice.className='muted tiny';$('result-dialog').append(debugNotice); }
    debugNotice.textContent = debugMode ? game.debugSave || '' : '';
    if(win&&game.stage===20) $('result-unlock').textContent='第一幕クリア！ Stage21から第二幕。王将を編成して守り抜こう。同じ敵軍が王を狙います。';
    if (win && game.stage === D.bossStage) $('result-unlock').textContent = '第二幕クリア！ 王を守り抜きました。Stage41から第三幕。双方が1体ずつ動かし、敵王を倒そう！';
    if(reward?.introEquipment?.length)$('result-rewards').insertAdjacentHTML('beforeend','<p>第三幕の初クリア贈呈：'+reward.introEquipment.map(id=>D.equipment[id].name).join('・')+'</p>');
    if (!$('result-dialog').open) $('result-dialog').showModal();
  }

  function render() {
    if (game.phase === 'ended') {
      stopAuto();
      if (debugBattle && !debugBattle.submitted) { debugBattle.submitted=true; void saveDebugClear(game,debugBattle); }
      if (P.award(profile, game)) { game.inventory = { ...profile.inventory }; game.playerLevel = profile.unlocked; game.costBonus = P.costBonus(profile); game.slotBonus = profile.slotBonus; saveProgress(); }
    }
    renderRoster(); const effectDuration = renderBoard(); renderDetail();
    if (game.phase === 'ended' && !shownResult) {
      shownResult = true;
      const endedGame = game;
      resultTimer = setTimeout(() => {
        resultTimer = null;
        if (game !== endedGame) return;
        renderStatus(); showResult();
      }, effectDuration + (game.result.result === 'win' ? 1000 : 0));
    }
    renderStatus();
  }

  // イベント委譲により描画し直したボタンも同じ入力経路を利用する。
  $('roster').addEventListener('click', event => {
    const button = event.target.closest('[data-roster]');
    if (button) {
      if (game.addUnit(button.dataset.roster)) { saveFormation(); $('army-dialog').close(); }
      render();
    }
  });
  $('deployed-list').addEventListener('click', event => {
    const button = event.target.closest('[data-unit]');
    if (button) {
      game.selected = button.dataset.unit; game.message = '';
      render(); $('status-dialog').close();
      const u = game.unit(game.selected);
      $('board').querySelector(`[data-x="${u.x}"][data-y="${u.y}"]`)?.focus();
    }
  });
  $('unit-detail').addEventListener('click', event => {
    if (event.target.closest('#reset-shared-upgrades')) {
      const notice=$('reset-shared-confirm'),button=$('reset-shared-upgrades');
      if(notice.hidden){notice.hidden=false;button.textContent='強化を全リセット（もう一度で確定）';}
      else {if(P.resetSharedUpgrades(profile,game))saveProgress();render();}
      return;
    }
    if (event.target.closest('#cancel-reset-shared')) {
      $('reset-shared-confirm').hidden = true;
      $('reset-shared-upgrades').textContent='強化を全リセット';
      return;
    }
    if (event.target.closest('#remove-unit')) {
      const button = $('remove-unit');
      button.id = 'confirm-remove-unit'; button.textContent = '本当に編成から外す';
      $('remove-confirm').hidden = false; return;
    }
    if (event.target.closest('#cancel-remove-unit')) {
      const button = $('confirm-remove-unit');
      button.id = 'remove-unit'; button.textContent = 'この駒を編成から外す';
      $('remove-confirm').hidden = true; return;
    }
    if (event.target.closest('#confirm-remove-unit')) {
      if (game.removeUnit(game.selected)) {
        saveFormation(); game.selected = null;
        $('equipment-dialog').close(); render();
      }
      return;
    }
    const upgrade = event.target.closest('[data-upgrade]');
    if (upgrade) {
      if (P.upgrade(profile, game, game.selected, upgrade.dataset.upgrade)) saveProgress();
      render(); return;
    }
    const button = event.target.closest('[data-equipment]');
    if (button) { if (game.toggleEquipment(game.selected, button.dataset.equipment)) saveFormation(); render(); }
  });
  let drag = null, suppressClickUntil = 0;
  function openUnitSettings(id) {
    if (!game.unit(id) || resultTimer) return;
    const scroll = $('unit-detail').querySelector('.unit-equipment-scroll');
    if (scroll) scroll.scrollTop = 0;
    stopAuto(); game.selected = id; game.message = '';
    render(); if (mobileLayout.matches && !$('equipment-dialog').open) $('equipment-dialog').showModal();
  }
  function finishDrag(event, cancelled = false) {
    if (!drag || drag.pointerId !== event.pointerId) return;
    const current = drag; drag = null;
    clearTimeout(current.holdTimer);
    current.ghost?.remove();
    if ($('board').hasPointerCapture(event.pointerId)) $('board').releasePointerCapture(event.pointerId);
    suppressClickUntil = performance.now() + 500;
    if (current.held) return;
    if (!current.started) {
      if (!cancelled) $('board').querySelector(`.cell-select[data-x="${game.unit(current.id)?.x}"][data-y="${game.unit(current.id)?.y}"]`)?.click();
      return;
    }
    if (!cancelled) {
      const target = document.elementFromPoint(event.clientX, event.clientY)?.closest('.cell-select');
      if (target && $('board').contains(target)) {
        const x = Number(target.dataset.x), y = Number(target.dataset.y);
        if (game.phase === 'prepare') {
          if (game.place(current.id, x, y)) { saveFormation(); game.selected = null; }
        } else if (game.phase === 'battle' && game.move(current.id, x, y)) game.selected = null;
      }
    }
    render();
  }
  $('board').addEventListener('pointerdown', event => {
    suppressClickUntil = 0;
    if (!event.isPrimary || event.button !== 0 || game.phase === 'ended') return;
    const button = event.target.closest('.cell-select');
    if (!button) return;
    const unit = R.at(game.units, Number(button.dataset.x), Number(button.dataset.y));
    if (!unit) return;
    if (game.phase === 'battle') { stopAuto(); renderStatus(); }
    drag = { id: unit.id, pointerId: event.pointerId, x: event.clientX, y: event.clientY, started: false, canDrag: unit.team === 'ally', piece: button.querySelector('.piece').cloneNode(true) };
    if (mobileLayout.matches || event.pointerType === 'touch') {
      const current = drag;
      current.holdTimer = setTimeout(() => {
        if (drag !== current || current.started) return;
        current.held = true; openUnitSettings(current.id);
      }, 550);
    }
    $('board').setPointerCapture(event.pointerId);
  });
  $('board').addEventListener('pointermove', event => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (drag.held) return;
    if (!drag.started && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) >= 8) {
      clearTimeout(drag.holdTimer);
      if (!drag.canDrag) { finishDrag(event, true); return; }
      drag.started = true; game.selected = drag.id;
      drag.ghost = drag.piece; drag.ghost.classList.add('drag-ghost');
      document.body.append(drag.ghost); render();
    }
    if (drag.started) { drag.ghost.style.left = `${event.clientX}px`; drag.ghost.style.top = `${event.clientY}px`; }
  });
  $('board').addEventListener('pointerup', event => finishDrag(event));
  $('board').addEventListener('pointercancel', event => finishDrag(event, true));
  $('board').addEventListener('lostpointercapture', event => finishDrag(event, true));
  $('board').addEventListener('contextmenu', event => {
    if (event.target.closest('.cell-select:has(.piece)')) event.preventDefault();
  });
  window.addEventListener('blur', () => { if (drag) finishDrag({ pointerId: drag.pointerId }, true); });
  $('board').addEventListener('click', event => {
    if (event.detail && performance.now() < suppressClickUntil) return;
    if (game.phase === 'ended' && resultTimer) return;
    const button = event.target.closest('[data-x]');
    if (!button) return;
    const x = Number(button.dataset.x), y = Number(button.dataset.y), u = R.at(game.units, x, y);
    if(game.duel&&game.phase==='battle'&&game.battleStep==='ally'&&game.selected&&!u){
      if(game.move(game.selected,x,y))game.selected=null;
      render();return;
    }
    if (game.selected && (!u || mobileLayout.matches)) {
      game.selected = null; game.message = ''; render(); return;
    }
    if (u) {
      if (mobileLayout.matches) { game.selected = u.id; game.message = ''; render(); }
      else openUnitSettings(u.id);
      return;
    }
    else if (!game.selected && mobileLayout.matches) { openArmy(); return; }
    render();
  });
  $('primary-button').addEventListener('click', () => {
    if (game.phase === 'prepare') {
      saveFormation();
      if (debugMode) {
        debugBattle = {firstClear:!profile.stageRecords[game.stage],moves:[],departure:{formation:P.snapshot(game),inventory:{...game.inventory},playerLevel:game.playerLevel,profile:JSON.parse(JSON.stringify(profile))}};
        const battle = debugBattle, move = game.move.bind(game);
        game.move = (id,x,y) => { const turn=game.turn,step=game.battleStep;const ok=move(id,x,y);if(ok)battle.moves.push({id,x,y,turn,step});return ok; };
      }
      if (game.start()) startAuto();
    }
    else if (game.phase === 'battle') { stopAuto(); game.advance(); }
    else { showResult(); return; }
    render();
  });
  $('breakthrough').addEventListener('click', () => {
    const u = game.unit(game.selected);
    if (u && game.move(u.id, u.x, -1)) game.selected = null;
    render();
  });
  $('auto-button').addEventListener('click', () => {
    if (autoTimer) stopAuto();
    else startAuto();
    renderStatus();
  });
  $('stage-select').addEventListener('change', event => loadStage(Number(event.target.value)));
  $('stage-list-button').addEventListener('click', openStages);
  $('mobile-army-button').addEventListener('click', openArmy);
  $('mobile-stage-button').addEventListener('click', openStages);
  $('result-stages').addEventListener('click', openStages);
  $('stage-grid').addEventListener('click', event => {
    const button = event.target.closest('[data-stage]');
    if (button && !button.disabled) loadStage(Number(button.dataset.stage));
  });
  $('stage-prev').addEventListener('click', () => { stagePage--; renderStages(); });
  $('stage-next').addEventListener('click', () => { stagePage++; renderStages(); });
  $('reset-save-button').addEventListener('click', () => {
    stopAuto(); renderStatus(); $('reset-notice').textContent = ''; $('reset-dialog').showModal();
  });
  $('confirm-reset').addEventListener('click', () => {
    const fresh = P.defaults();
    try {
      localStorage.removeItem(P.legacyKey);
      localStorage.setItem(P.saveKey, JSON.stringify(fresh));
    } catch {
      $('reset-notice').textContent = '保存データを削除できませんでした。ブラウザーの保存設定を確認してください。';
      return;
    }
    profile = fresh; storageAvailable = true;
    loadStage(1);
    game.message = 'セーブを削除しました。Stage 1からやり直せます。';
    render();
  });
  $('status-button').addEventListener('click', () => { renderRoster(); $('status-dialog').showModal(); });
  // ダイアログの外で押して離した場合だけ閉じる。内側からのドラッグでは閉じない。
  let equipmentBackdropPressed = false;
  function outsideEquipment(event) {
    const bounds = $('equipment-dialog').getBoundingClientRect();
    return event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom;
  }
  $('equipment-dialog').addEventListener('pointerdown', event => {
    equipmentBackdropPressed = event.button === 0 && outsideEquipment(event);
  });
  $('equipment-dialog').addEventListener('pointercancel', () => { equipmentBackdropPressed = false; });
  $('equipment-dialog').addEventListener('click', event => {
    if (equipmentBackdropPressed && outsideEquipment(event)) $('equipment-dialog').close();
    equipmentBackdropPressed = false;
  });
  $('equipment-dialog').addEventListener('close', () => {
    equipmentBackdropPressed = false;
    const unit = game.unit(game.selected);
    if (unit) $('board').querySelector(`.cell-select[data-x="${unit.x}"][data-y="${unit.y}"]`)?.focus();
  });
  // 指スクロール直後に互換clickが省略される端末でも、×のタップを受け取る。
  const equipmentClose = $('equipment-dialog').querySelector('[data-close]');
  let closePress = null;
  equipmentClose.addEventListener('pointerdown', event => {
    closePress = event.pointerType === 'touch' && event.isPrimary ? { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false } : null;
  });
  equipmentClose.addEventListener('pointermove', event => {
    if (closePress && Math.hypot(event.clientX - closePress.x, event.clientY - closePress.y) >= 8) closePress.moved = true;
  });
  equipmentClose.addEventListener('pointercancel', () => { closePress = null; });
  equipmentClose.addEventListener('pointerup', event => {
    if (closePress?.id === event.pointerId && !closePress.moved) {
      suppressClickUntil = performance.now() + 500; $('equipment-dialog').close();
    }
    closePress = null;
  });
  $('restart-button').addEventListener('click', () => loadStage(game.stage));
  $('result-retry').addEventListener('click', () => loadStage(game.stage));
  $('result-next').addEventListener('click', () => loadStage(game.stage + 1));
  $('help-button').addEventListener('click', () => {
    stopAuto();renderStatus();
    $('start-chapter-two').disabled=game.phase!=='prepare';
    $('start-chapter-two').dataset.confirm='';
    $('start-chapter-two').textContent='Stage21から始める';
    $('chapter-two-notice').textContent='';
    $('restore-chapter-two').disabled=game.phase!=='prepare';
    $('restore-chapter-two').dataset.confirm='';
    $('restore-chapter-two').textContent='切り替え前のセーブに戻す';
    $('start-chapter-three').disabled=game.phase!=='prepare';
    $('restore-chapter-three').disabled=game.phase!=='prepare';
    $('start-chapter-three').dataset.confirm='';$('start-chapter-three').textContent='Stage41から始める';
    $('restore-chapter-three').dataset.confirm='';$('restore-chapter-three').textContent='第三幕へ切り替える前のセーブに戻す';
    $('chapter-three-notice').textContent='';
    $('help-dialog').showModal();
  });
  $('restore-chapter-two').addEventListener('click',()=>{
    const button=$('restore-chapter-two');
    if(game.phase!=='prepare')return;
    if(!button.dataset.confirm){
      button.dataset.confirm='yes';button.textContent='もう一度押して元のセーブに戻す';
      $('chapter-two-notice').textContent='Stage21開始前のバックアップへ戻します。切り替え後の進行は置き換わります。';
      $('start-chapter-two').dataset.confirm='';$('start-chapter-two').textContent='Stage21から始める';
      return;
    }
    const result=restoreChapterTwoBackup();
    if(result.ok)$('help-dialog').close();
    else $('chapter-two-notice').textContent=result.errors.join(' ');
  });
  $('start-chapter-two').addEventListener('click',()=>{
    const button=$('start-chapter-two');
    if(game.phase!=='prepare')return;
    if(!button.dataset.confirm){
      button.dataset.confirm='yes';button.textContent='もう一度押してStage21から始める';
      $('restore-chapter-two').dataset.confirm='';$('restore-chapter-two').textContent='切り替え前のセーブに戻す';
      $('chapter-two-notice').textContent='現在のセーブをバックアップし、第一幕の装備を全回収・強化未使用20P・王入り初期編成に切り替えます。';
      return;
    }
    const result=startChapterTwo();
    if(result.ok)$('help-dialog').close();
    else $('chapter-two-notice').textContent=result.errors.join(' ');
  });
  $('restore-chapter-three').addEventListener('click',()=>{
    const button=$('restore-chapter-three');
    if(game.phase!=='prepare')return;
    if(!button.dataset.confirm){
      button.dataset.confirm='yes';button.textContent='もう一度押して元のセーブに戻す';
      $('chapter-three-notice').textContent='Stage41開始前のバックアップへ戻します。切り替え後の進行は置き換わります。';
      $('start-chapter-three').dataset.confirm='';$('start-chapter-three').textContent='Stage41から始める';
      return;
    }
    const result=restoreChapterThreeBackup();
    if(result.ok)$('help-dialog').close();
    else $('chapter-three-notice').textContent=result.errors.join(' ');
  });
  $('start-chapter-three').addEventListener('click',()=>{
    const button=$('start-chapter-three');
    if(game.phase!=='prepare')return;
    if(!button.dataset.confirm){
      button.dataset.confirm='yes';button.textContent='もう一度押してStage41から始める';
      $('restore-chapter-three').dataset.confirm='';$('restore-chapter-three').textContent='切り替え前のセーブに戻す';
      $('chapter-three-notice').textContent='現在のセーブをバックアップし、第二幕までの装備を全回収・強化未使用40P・王入り初期編成に切り替えます。';
      return;
    }
    const result=startChapterThree();
    if(result.ok)$('help-dialog').close();
    else $('chapter-three-notice').textContent=result.errors.join(' ');
  });
  document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => {
    $(button.dataset.close).close();
    if (button.dataset.close === 'equipment-dialog' && !mobileLayout.matches) { game.selected = null; render(); }
  }));
  // タブ非表示時は意図せず戦闘が進まないように一時停止する。
  document.addEventListener('visibilitychange', () => { if (document.hidden) { stopAuto(); renderStatus(); } });
  mobileLayout.addEventListener('change', () => { syncLayout(); render(); });
  syncLayout();
  saveProgress();
  render();
})();
