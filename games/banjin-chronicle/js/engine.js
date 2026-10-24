/* 戦闘状態を管理する。DOMに依存せず、テストからも同じ戦闘を実行できる。 */
(function (root) {
  'use strict';
  const D = typeof module !== 'undefined' ? require('./data.js') : root.BanjinData;
  const R = typeof module !== 'undefined' ? require('./rules.js') : root.BanjinRules;
  // 同種の味方駒を戦況記録でも区別する。
  const label = unit => unit.serial ? `${unit.name} #${unit.serial}` : unit.name;
  function actionsFor(unit) {
    const items = unit.equipment.map(id => D.equipment[id]).filter(e => e.action !== 'special');
    const attacks = items.filter(e => e.action === 'attack');
    return [
      ...items.filter(e => e.action === 'buff' || e.action === 'debuff'),
      ...attacks,
      ...items.filter(e => e.action === 'heal')
    ];
  }

  function createUnit(type, team, x, y, id, stage = 1) {
    const p = D.pieces[type];
    const bonus = team === 'enemy' ? Math.min(9, Math.max(0, stage - 1)) + Math.floor(Math.max(0, stage - 10) / 5) : 0;
    const endurance = team === 'enemy' && stage >= 4 ? 1.1 + Math.min(15, Math.floor((stage - 4) / 2)) / 100 : 1;
    const hp = Math.ceil((p.hp + bonus * 3) * endurance);
    return { ...p, id, type, team, x, y, maxHp: hp, hp,
      atk: p.atk + bonus, matk: p.matk + bonus, equipment: [], effects: [], promoted: false, moved: 0,
      upgrades: Object.fromEntries(Object.keys(D.statNames).map(name => [name, 0])) };
  }

  function enemyArmy(stage) {
    // 第21戦は第一幕の最終戦と完全に同じ敵。狙いの変化を体験する導入。
    if (stage === 21) return enemyArmy(20);
    if(stage>=41){
      const layout=[
        ['king',4,0],['gold',3,1],['gold',5,1],['silver',2,2],['silver',6,2],
        ['pawn',3,2],['pawn',5,2],['rook',4,1],['bishop',7,1],['lance',0,0],
        ['knight',1,0],['knight',7,0],['lance',8,0],['pawn',0,2],['pawn',1,2],
        ['pawn',2,1],['pawn',4,2],['pawn',6,1],['pawn',7,2],['pawn',8,2]
      ];
      const count=[8,10,12,14,15,16,17,18,19,20][Math.min(9,stage-41)];
      return layout.slice(0,count).map(([type,x,y],i)=>{
        const u=createUnit(type,'enemy',x,y,'enemy-'+i,30+(stage-41)*2);u.slots=10;
        u.equipment=[D.pieces[type].attackAttr==='magic'?'staff':'sword'];
        if(type==='king')u.equipment.push('heal','ward');
        if(type==='gold')u.equipment.push('armor');
        if(type==='silver')u.equipment.push(stage>=43?'thunder':'flame');
        if(type==='rook')u.equipment=['blade'];
        if(stage>=42&&type==='gold'&&(i===1||stage>=44))u.equipment.push('bulwark');
        if(stage>=45&&type==='bishop')u.equipment.push('grimoire','pierce');
        if(stage>=46&&type==='knight')u.equipment.push('flame');
        if(stage>=47&&type==='lance')u.equipment.push('pierce');
        if(stage>=48&&type==='king')u.equipment=u.equipment.filter(id=>id!=='heal').concat('healGreater');
        if(stage>=49&&type==='silver')u.equipment.push('curseGreater');
        if(stage===50&&type==='king'){u.boss=true;u.name='第三幕の大将';u.hp=u.maxHp=Math.ceil(u.maxHp*1.5);u.equipment.push('armor','bannerGreater');}
        return u;
      });
    }
    // 少数の前衛から二十枚の初期配置へ。出現順と座標は固定で再挑戦できる。
    const layouts = [
      ['pawn', 1, 2], ['pawn', 4, 2], ['pawn', 7, 2], ['silver', 3, 1],
      ['gold', 6, 1], ['bishop', 0, 0], ['rook', 8, 0], ['knight', 5, 0], ['lance', 2, 0]
    ];
    const army = layouts.slice(0, Math.min(9, stage + 2));
    if (stage >= 10) {
      army[5] = ['bishop', 7, 1]; army[6] = ['rook', 1, 1];
      army[7] = ['knight', 7, 0]; army[8] = ['lance', 0, 0];
    }
    if (stage >= 14) { army[3] = ['silver', 2, 0]; army[4] = ['gold', 3, 0]; }
    const reinforcements = [
      [8, 'pawn', 0, 2], [9, 'pawn', 2, 2], [10, 'pawn', 3, 2],
      [11, 'pawn', 5, 2], [12, 'pawn', 6, 2], [13, 'pawn', 8, 2],
      [14, 'silver', 6, 0], [15, 'gold', 5, 0], [16, 'knight', 1, 0],
      [18, 'lance', 8, 0], [20, 'king', 4, 0]
    ];
    for (const [level, ...piece] of reinforcements) if (stage >= level) army.push(piece);
    const castle=D.castleFormation(stage);
    if(castle)army.splice(0,army.length,...castle.pieces);
    return army.map(([type, x, y, tx, ty], i) => {
      const unit = createUnit(type, 'enemy', x, y, `enemy-${i}`, stage >= 22 ? stage-1 : stage);
      if(castle)unit.openingTarget={x:tx,y:ty};
      // 敵にも攻撃装備を明示し、装備なしの通常攻撃には依存しない。
      unit.equipment.push(D.pieces[type].attackAttr === 'magic' ? 'staff' : 'sword');
      // 前列の歩兵九枚がそろってから、後衛の射線を通す。
      if (stage >= 13 && (type === 'rook' || type === 'bishop')) unit.equipment.push('pierce');
      if (stage === 20 && type === 'king') {
        unit.boss = true; unit.name = '第一幕の大将';
      }
      if (D.kingDefense(stage)) {
        unit.slots += 4;
        if (stage>=22 && type==='gold') unit.equipment.push('armor');
        if (stage>=24 && type==='knight') unit.equipment.push('flame');
        if (stage>=25 && type==='silver') unit.equipment.push('curse');
        if (stage>=28 && type==='gold') unit.equipment.push('banner');
        if (stage>=30 && type==='bishop') unit.equipment.push('grimoire');
        if (stage>=32 && type==='king') unit.equipment.push('heal');
        if (stage>=35 && type==='rook') unit.equipment[0]='blade';
        if (stage>=38 && type==='lance') unit.equipment.push('pierce');
        if (stage===40 && type==='king') {
          unit.boss=true;unit.name='第二幕の大将';unit.equipment.push('armor','ward','bannerGreater');
          unit.hp=unit.maxHp=Math.ceil(unit.maxHp*1.5);
        }
      }
      return unit;
    });
  }

  // 予告と実行で共用する決定的な一手探索。戦闘本体の状態は変更しない。
  function planEnemyMoves(units, turn = 1, tutorial = false, huntKing = false) {
    const board = units.map(u => ({ ...u, effects: u.effects.filter(e => e.expires > turn) }));
    const enemies = board.filter(u => u.team === 'enemy' && u.hp > 0).sort((a,b) => b.y-a.y || a.x-b.x || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    if(huntKing&&turn===1&&enemies.some(u=>u.openingTarget))return planCastleOpening(board,enemies);
    const plans = [];
    for (const unit of enemies) {
      const from = { x: unit.x, y: unit.y };
      if (huntKing) {
        const king = board.find(u=>u.team==='ally' && u.type==='king' && u.hp>0);
        const best = king ? kingHuntMove(unit,king,board) : from;
        plans.push({id:unit.id,from,to:{x:best.x,y:best.y},reason:'king',target:king?.id});
        unit.x=best.x;unit.y=best.y;
        if (unit.y>=6 && D.promotion[unit.type]) unit.promoted=true;
        continue;
      }
      if (unit.y === 8) { plans.push({ id: unit.id, from, to: { ...from }, breakthrough: true }); break; }
      if (tutorial) {
        const to = { x: unit.x,y: R.at(board,unit.x,unit.y+1) ? unit.y : unit.y+1 };
        plans.push({ id: unit.id,from,to }); unit.y=to.y; continue;
      }
      const moves = R.moves(unit,board).filter(([x,y]) => y >= unit.y && Math.max(Math.abs(x-unit.x),Math.abs(y-unit.y)) <= 2);
      const forward = moves.filter(([,y]) => y > unit.y);
      let candidates, reason;
      if (forward.length) {
        candidates = forward.map(([x,y])=>({x,y}));
        reason = 'forward';
      } else {
        candidates = moves.filter(([,y])=>y===unit.y).filter(([x,y])=>{
          const moved={...unit,x,y}, hypothetical=board.map(u=>u.id===unit.id?moved:u);
          return R.moves(moved,hypothetical).some(([nx,ny])=>ny>y && Math.max(Math.abs(nx-x),Math.abs(ny-y))<=2);
        }).map(([x,y])=>({x,y}));
        reason = candidates.length ? 'detour' : 'wait';
      }
      // 前進は必須。その中で攻撃・撃破と生存を評価し、危険な直進に固執しない。
      // 横移動は次に前進できる迂回だけなので、射程回避の往復はしない。
      for (const candidate of candidates) {
        const moved = {...unit,...candidate,promoted:unit.promoted || (candidate.y>=6 && !!D.promotion[unit.type])};
        const hypothetical = board.map(u=>u.id===unit.id?moved:u);
        const allies = hypothetical.filter(u=>u.team==='ally' && u.hp>0);
        let outgoing=0,incoming=0,kills=0;
        const dealt = new Map();
        for (const item of actionsFor(moved).filter(a=>a.action==='attack')) {
          const range = new Set(R.actionRange(moved,item,hypothetical).map(p=>R.key(...p)));
          for (const ally of allies) if (range.has(R.key(ally.x,ally.y))) dealt.set(ally.id,(dealt.get(ally.id)||0)+R.damage(moved,ally,item.attr,item.power));
        }
        for (const ally of allies) {
          const damage = dealt.get(ally.id)||0;
          outgoing += Math.min(ally.hp,damage);
          if (damage>=ally.hp) { kills++; continue; }
          for (const item of actionsFor(ally).filter(a=>a.action==='attack')) {
            if (R.actionRange(ally,item,hypothetical).some(([x,y])=>x===moved.x&&y===moved.y)) incoming += R.damage(ally,moved,item.attr,item.power);
          }
        }
        candidate.score = (candidate.y-unit.y)*18 + outgoing*.6 + kills*20 - Math.min(incoming,unit.hp)*.7 - (incoming>=unit.hp?60:0)
          - (candidate.x===unit.aiPrevious?.x&&candidate.y===unit.aiPrevious?.y?8:0);
      }
      candidates.sort((a,b)=>b.score-a.score || b.y-a.y || Math.abs(a.x-unit.x)-Math.abs(b.x-unit.x) || Math.abs(a.x-4)-Math.abs(b.x-4) || a.x-b.x);
      const best = candidates[0] || {x:unit.x,y:unit.y};
      plans.push({ id:unit.id,from,to:{x:best.x,y:best.y},reason,forcedForward:forward.length>0 });
      unit.x = best.x; unit.y = best.y;
      if (unit.y>=6 && D.promotion[unit.type]) unit.promoted = true;
    }
    return plans;
  }

  // 歩や退路を空ける駒から順に動かす。通常の移動・遮蔽ルールで囲いを完成させる。
  function planCastleOpening(board,enemies) {
    let pending=[...enemies];const plans=[];
    while(pending.length){
      const deferred=[];let progressed=false;
      for(const unit of pending){
        const from={x:unit.x,y:unit.y},to=unit.openingTarget||from;
        const stayed=to.x===from.x&&to.y===from.y;
        const legal=stayed||Math.max(Math.abs(to.x-from.x),Math.abs(to.y-from.y))<=2&&R.moves(unit,board).some(([x,y])=>x===to.x&&y===to.y);
        if(!legal){deferred.push(unit);continue;}
        plans.push({id:unit.id,from,to:{...to},reason:'castle'});unit.x=to.x;unit.y=to.y;progressed=true;
      }
      if(!progressed){for(const unit of deferred)plans.push({id:unit.id,from:{x:unit.x,y:unit.y},to:{x:unit.x,y:unit.y},reason:'wait'});break;}
      pending=deferred;
    }
    return plans;
  }

  // 王に攻撃できるマスまでの経路を逆向きBFSで求める。占有マスと成りを考慮。
  function kingHuntMove(unit, king, board, mustMove=false) {
    const obstacles=board.filter(u=>u.id!==unit.id && u.hp>0), promotable=!!D.promotion[unit.type];
    const nodeKey=u=>`${u.x},${u.y},${Number(!!u.promoted)}`;
    const nodes=new Map(),reverse=new Map(),distances=new Map(),queue=[];
    for(let y=0;y<9;y++)for(let x=0;x<9;x++)if(!R.at(obstacles,x,y)){
      const states=unit.promoted?[true]:promotable?(y>=6?[true]:[false,true]):[false];
      for(const promoted of states){const moved={...unit,x,y,promoted};nodes.set(nodeKey(moved),moved);}
    }
    const attacks=actionsFor(unit).filter(a=>a.action==='attack');
    for(const [key,moved] of nodes){
      const hypothetical=[...obstacles,moved];
      if(attacks.some(item=>R.actionRange(moved,item,hypothetical).some(([x,y])=>x===king.x&&y===king.y))){distances.set(key,0);queue.push(key);}
      for(const [x,y] of R.moves(moved,hypothetical).filter(([x,y])=>Math.max(Math.abs(x-moved.x),Math.abs(y-moved.y))<=2)){
        const next=nodeKey({...moved,x,y,promoted:moved.promoted||(y>=6&&promotable)});
        if(!reverse.has(next))reverse.set(next,[]);
        reverse.get(next).push(key);
      }
    }
    for(let i=0;i<queue.length;i++)for(const previous of reverse.get(queue[i])||[])if(!distances.has(previous)){
      distances.set(previous,distances.get(queue[i])+1);queue.push(previous);
    }
    const candidates=[...(mustMove?[]:[[unit.x,unit.y]]),...R.moves(unit,board).filter(([x,y])=>Math.max(Math.abs(x-unit.x),Math.abs(y-unit.y))<=2)];
    const evaluated=candidates.map(([x,y])=>{
      const moved={...unit,x,y,promoted:unit.promoted||(y>=6&&promotable)},hypothetical=[...obstacles,moved];
      let kingDamage=0,outgoing=0,incoming=0;
      const dealt=new Map();
      for(const item of attacks){
        const range=new Set(R.actionRange(moved,item,hypothetical).map(p=>R.key(...p)));
        for(const ally of obstacles.filter(u=>u.team==='ally'))if(range.has(R.key(ally.x,ally.y)))dealt.set(ally.id,(dealt.get(ally.id)||0)+R.damage(moved,ally,item.attr,item.power));
      }
      for(const ally of obstacles.filter(u=>u.team==='ally')){
        const damage=dealt.get(ally.id)||0;outgoing+=Math.min(ally.hp,damage);
        if(ally.id===king.id)kingDamage=damage;
        if(damage>=ally.hp)continue;
        for(const item of actionsFor(ally).filter(a=>a.action==='attack'))if(R.actionRange(ally,item,hypothetical).some(([tx,ty])=>tx===x&&ty===y))incoming+=R.damage(ally,moved,item.attr,item.power);
      }
      const distance=distances.get(nodeKey(moved)) ?? 12+Math.max(Math.abs(x-king.x),Math.abs(y-king.y));
      const stayed=x===unit.x&&y===unit.y,repeated=x===unit.aiPrevious?.x&&y===unit.aiPrevious?.y;
      const score=-distance*35+Math.min(king.hp,kingDamage)*8+(kingDamage>=king.hp?10000:0)+outgoing*.6-Math.min(unit.hp,incoming)*.3-(stayed&&distance>0?5:0)-(repeated?7:0);
      return {x,y,score};
    });
    evaluated.sort((a,b)=>b.score-a.score || b.y-a.y || Math.abs(a.x-king.x)-Math.abs(b.x-king.x) || a.x-b.x);
    return evaluated[0];
  }

  class Game {
    constructor(stage = 1, formation = null, inventory = {}, playerLevel = 1, sharedUpgrades = {}, slotBonus = 0, costBonus = 0) {
      this.stage = stage;
      this.playerLevel = playerLevel;
      this.costBonus = costBonus;
      this.sharedUpgrades = {...sharedUpgrades};
      this.slotBonus = slotBonus;
      this.phase = 'prepare';
      this.battleStep = 'enemy';
      this.turn = 1;
      this.units = [];
      this.logs = [];
      this.events = [];
      this.result = null;
      this.selected = 'ally-rook';
      this.message = '';
      this.inventory = { ...inventory };
      this.damageTaken = 0;
      this.rewardSettled = false;
      const army = formation || D.defaults.map((type, i) => ({ type, id: `ally-${type}`, serial: i + 1,
        x: D.positions[type][0], y: D.positions[type][1], equipment: ['sword'] }));
      this.units = army.map(p => {
        const u = { ...createUnit(p.type, 'ally', p.x, p.y, p.id), serial: p.serial, equipment: [...p.equipment], upgradePointsSpent: p.upgradePointsSpent, upgrades: Object.fromEntries(Object.keys(D.statNames).map(name => [name, p.upgrades?.[name] || 0])) };
        u.slots = D.equipmentSlots(u.type, this.playerLevel, this.slotBonus);
        for (const name of Object.keys(D.statNames)) {
          const bonus = ((u.upgrades[name] || 0) + (this.sharedUpgrades[name] || 0)) * (name === 'hp' ? 5 : 1);
          if (name === 'hp') { u.maxHp += bonus; u.hp += bonus; } else u[name] += bonus;
        }
        return u;
      });
      this.nextSerial = Math.max(1, ...army.map(u => u.serial + 1));
      this.selected = this.unit('ally-rook')?.id || this.allies[0]?.id || null;
      this.units.push(...enemyArmy(stage));
      this.log(`Stage ${stage} — 出陣準備。上限コスト ${this.limit}。`, 'system');
    }
    get allies() { return this.units.filter(u => u.team === 'ally'); }
    get enemies() { return this.units.filter(u => u.team === 'enemy'); }
    enemyPlan() {
      if(this.duel){
        const king=this.allies.find(u=>u.type==='king');if(!king)return [];
        const board=this.units.map(u=>({...u,effects:u.effects.filter(e=>e.expires>this.turn)}));
        const plans=this.enemies.map(u=>{const to=kingHuntMove(board.find(v=>v.id===u.id),king,board,true);if(!to)return null;return {id:u.id,from:{x:u.x,y:u.y},to:{x:to.x,y:to.y},score:to.score,reason:'duel'};}).filter(Boolean);
        plans.sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id));return plans.slice(0,1);
      }
      return planEnemyMoves(this.units, this.turn + (this.phase === 'battle' && this.battleStep === 'ally' ? 1 : 0), this.stage <= 3, this.kingDefense); }
    get duel() { return this.stage>=41; }
    get requiresKing() { return this.kingDefense||this.duel; }
    legalMoves(u) { return R.moves(u,this.units); }
    get kingDefense() { return D.kingDefense(this.stage); }
    get limit() { return Math.min(61, this.playerLevel + 20 + (this.costBonus ? 1 : 0)); }
    get cost() { return this.allies.reduce((sum, u) => sum + u.cost, 0); }
    get placementUnlocked() { return true; }
    get movementUnlocked() { return this.stage >= 41; }
    get overUnitLimit() { return Object.entries(D.unitLimits).some(([type, limit]) => this.allies.filter(u => u.type === type).length > limit); }
    unit(id) { return this.units.find(u => u.id === id); }
    log(text, kind = 'system') { this.logs.unshift({ text, kind, turn: this.turn }); this.logs.length = Math.min(70, this.logs.length); }
    fail(text) { this.message = text; return false; }

    addUnit(type) {
      if (this.phase !== 'prepare') return this.fail('編成は出陣準備中に変更できます。');
      if (!Object.hasOwn(D.pieces, type)) return false;
      if (this.allies.filter(u => u.type === type).length >= D.unitLimits[type]) return this.fail(`${D.pieces[type].name}は${D.unitLimits[type]}体まで配置できます。`);
      if (this.cost + D.pieces[type].cost > this.limit) return this.fail('コスト上限を超えています。別の駒を外してください。');
      if (this.available('sword') < 1) return this.fail('追加する駒に装備する刀が不足しています。');
      let pos = D.positions[type];
      if (R.at(this.units, ...pos)) {
        const empty = [];
        for (let y = 6; y < 9; y++) for (let x = 0; x < 9; x++) if (!R.at(this.units, x, y)) empty.push([x, y]);
        if (!empty.length) return this.fail('自陣に空きマスがありません。');
        pos = empty[0];
      }
      let serial = this.nextSerial++;
      while (this.unit(`ally-${serial}`)) serial = this.nextSerial++;
      const u = createUnit(type, 'ally', ...pos, `ally-${serial}`);
      u.equipment = ['sword'];
      for (const name of Object.keys(D.statNames)) {
        const bonus = (this.sharedUpgrades[name] || 0) * (name === 'hp' ? 5 : 1);
        if (name === 'hp') { u.maxHp += bonus; u.hp += bonus; } else u[name] += bonus;
      }
      u.slots = D.equipmentSlots(type, this.playerLevel, this.slotBonus);
      u.serial = serial;
      this.units.push(u); this.selected = u.id;
      this.message = '';
      return true;
    }

    removeUnit(id) {
      if (this.phase !== 'prepare') return this.fail('編成は出陣準備中に変更できます。');
      const u = this.unit(id);
      if (!u || u.team !== 'ally') return false;
      this.units = this.units.filter(p => p.id !== id);
      if (this.selected === id) this.selected = this.allies[0]?.id || null;
      this.message = '';
      return true;
    }

    available(itemId) {
      // 戦闘で駒が倒れても、次の出陣へ引き継ぐ装備の予約は解放しない。
      const assigned = this.phase === 'prepare'
        ? this.allies.filter(u => u.equipment.includes(itemId)).length
        : (this.reservedEquipment || []).filter(id => id === itemId).length;
      return Math.max(0, (this.inventory[itemId] || 0) - assigned);
    }

    toggleEquipment(id, itemId) {
      const u = this.unit(id);
      if (this.phase !== 'prepare' || !u || u.team !== 'ally' || !D.equipment[itemId]) return this.fail('味方の装備は出陣準備中に変更できます。');
      if (u.equipment.includes(itemId)) u.equipment = u.equipment.filter(e => e !== itemId);
      else {
        if (D.usedSlots(u.equipment) + D.equipmentCost(itemId) > u.slots) return this.fail(`この装備は${D.equipmentCost(itemId)}枠必要です（使用枠 ${D.usedSlots(u.equipment)}/${u.slots}）。装備を外してから選んでください。`);
        if (this.available(itemId) < 1) return this.fail('この装備の未使用分がありません。クリア報酬で入手するか、別の駒から外してください。');
        u.equipment.push(itemId);
      }
      this.message = '';
      return true;
    }

    place(id, x, y) {
      const u = this.unit(id);
      if (this.phase !== 'prepare') return this.fail('初期配置は出陣準備中に変更できます。');
      if (!u || u.team !== 'ally' || !R.inside(x, y) || y < 6 || R.at(this.units, x, y)) return this.fail('自陣の空きマスを選んでください。');
      u.x = x; u.y = y;
      this.message = '';
      return true;
    }

    start() {
      if (this.phase !== 'prepare') return false;
      if (!this.allies.length) return this.fail('少なくとも1体を出陣させてください。');
      if (this.overUnitLimit) return this.fail('駒数の上限を超えています。編成を調整してください。');
      if (this.cost > this.limit) return this.fail('出陣コストが上限を超えています。');
      if (this.requiresKing && this.allies.filter(u=>u.type==='king').length!==1) return this.fail('この戦いは王将の編成が必須です。王を1体編成してください。');
      this.reservedEquipment = this.allies.flatMap(u => u.equipment);
      this.deployedAllyIds = this.allies.map(u => u.id);
      this.phase = 'battle';
      this.battleStep = this.duel?'ally':'enemy';
      this.allyMoved=null;
      this.message = '';
      this.log('出陣。敵の進軍を食い止めよ。');
      return true;
    }

    move(id, x, y) {
      const u = this.unit(id);
      if (this.phase !== 'battle' || !this.movementUnlocked) return this.fail('戦闘中の移動はStage41で解禁されます。');
      if (this.battleStep !== 'ally') return this.fail('敵の移動・攻撃を先に進めてください。その後に味方を移動できます。');
      if (!u || u.team !== 'ally') return false;
      if(this.duel&&this.allyMoved)return this.fail('この手番ではすでに1体を移動しました。味方攻撃へ進めてください。');
      const allowance = 1;
      if (u.moved >= allowance) return this.fail('この駒は移動済みです。ターンを進めてください。');
      if (!this.duel && y === -1 && x === u.x && R.canBreakthrough(u)) { this.finish('win', `${label(u)}が10行目へ到達。敵陣を突破！`); return true; }
      if (!this.legalMoves(u).some(p => p[0] === x && p[1] === y)) return this.fail('光っている移動可能マスを選んでください。');
      if(this.duel)this.events=[];
      u.x = x; u.y = y; u.moved++;
      if(this.duel)this.allyMoved=id;
      this.log(`${label(u)}が${x + 1}列・${9 - y}行へ移動。`);
      if (y <= 2 && D.promotion[u.type] && !u.promoted) {
        u.promoted = true;
        this.log(`${label(u)}が成り、行動範囲が拡大！`, 'buff');
        this.events.push({ id: u.id, text: '成り', kind: 'buff' });
      }
      this.message = '';
      if(this.duel){
        const events=[...this.events];this.advance();events.push(...this.events);
        if(this.phase==='battle'){this.advance();events.push(...this.events);}
        this.events=events;
      }
      return true;
    }

    finish(result, reason) {
      const deployed = this.deployedAllyIds || this.allies.map(u => u.id);
      const survivors = deployed.filter(id => this.allies.some(u => u.id === id && u.hp > 0)).length;
      this.phase = 'ended'; this.result = { result, reason, stage: this.stage, turns: this.turn, damageTaken: this.damageTaken, deployed: deployed.length, survivors };
      this.log(reason, result === 'win' ? 'buff' : 'damage');
    }

    checkAnnihilation() {
      if (this.requiresKing && !this.allies.some(u=>u.type==='king' && u.hp>0)) { this.finish('lose','王将が討ち取られました。'); return true; }
      if(this.duel&&!this.enemies.some(u=>u.type==='king'&&u.hp>0)){this.finish('win','敵の王将を撃破！');return true;}
      if (!this.allies.length) { this.finish('lose', '味方が全滅しました。'); return true; }
      if (!this.enemies.length) { this.finish('win', '敵をすべて撃破。盤陣を守り抜いた！'); return true; }
      return false;
    }

    act(unit) {
      for (const item of actionsFor(unit)) {
        const range = new Set(R.actionRange(unit, item, this.units).map(p => R.key(...p)));
        const beneficial = ['heal', 'buff'].includes(item.action);
        const targets = this.units.filter(t => range.has(R.key(t.x, t.y)) && (beneficial ? t.team === unit.team : t.team !== unit.team));
        for (const target of targets) {
          if (item.action === 'attack') {
            const amount = R.damage(unit, target, item.attr, item.power);
            target.hp = Math.max(0, target.hp - amount);
            if (target.team === 'ally') this.damageTaken += amount;
            // 座標を保存するため、撃破・移動済みの対象にも攻撃エフェクトを表示できる。
            this.events.push({ id: target.id, text: `−${amount}`, kind: 'damage', attr: item.attr,
              from: { x: unit.x, y: unit.y }, to: { x: target.x, y: target.y },
              defeated: target.hp === 0 ? { team: target.team, glyph: target.promoted ? D.promotion[target.type] : target.glyph } : null });
            this.log(`${label(unit)} → ${label(target)}：${item.attr === 'magic' ? '魔法' : '物理'}${unit.team === 'ally' ? '与ダメ' : '被ダメ'} ${amount}${target.hp === 0 ? '・撃破' : ''}`, 'damage');
          } else if (item.action === 'heal') {
            const healer = R.stats(unit);
            const amount = Math.min(healer.def + healer.mdef, target.maxHp - target.hp);
            if (amount > 0) {
              target.hp += amount;
              this.events.push({ id: target.id, text: `＋${amount}`, kind: 'heal' });
              this.log(`${label(unit)} → ${label(target)}：HP ${amount}回復`, 'heal');
            }
          } else {
            // 同種の効果は重複加算せず、残りターンを更新する。
            target.effects = target.effects.filter(e => e.kind !== item.action);
            const values = R.supportValues(unit, item.action);
            target.effects.push({ kind: item.action, values, expires: this.turn + 2 });
            this.events.push({ id: target.id, text: item.action === 'buff' ? '強化' : '弱化', kind: 'buff' });
            this.log(`${label(unit)} → ${label(target)}：${item.action === 'buff' ? '能力強化' : '能力弱化'}（物攻${values.atk}・物防${values.def}・魔攻${values.matk}・魔防${values.mdef}）`, 'buff');
          }
        }
        this.units = this.units.filter(u => u.hp > 0);
        if (this.checkAnnihilation()) return;
      }
    }

    advance() {
      if (this.phase !== 'battle') return false;
      this.events = [];
      this.message = '';
      if(this.duel){
        if(this.battleStep==='ally'&&!this.allyMoved)return this.fail('味方を1体移動してください。待機はできません。');
        if(this.checkAnnihilation())return true;
        const team=this.battleStep;
        if(team==='enemy'){
          const plans=this.enemyPlan();
          if(!plans.length){this.finish('win','敵が移動できなくなりました。');return true;}
          for(const plan of plans){
            const u=this.unit(plan.id);u.aiPrevious={x:u.x,y:u.y};u.x=plan.to.x;u.y=plan.to.y;
            this.log(`敵の${u.name}が${u.x+1}列・${9-u.y}行へ移動。`);
            if(u.y>=6&&D.promotion[u.type]&&!u.promoted){u.promoted=true;this.events.push({id:u.id,text:'成り',kind:'buff'});}
          }
        }
        this.log(team==='ally'?'── 味方全員の攻撃・支援 ──':'── 敵全員の攻撃・支援 ──');
        for(const u of [...(team==='ally'?this.allies:this.enemies)]){if(this.unit(u.id))this.act(u);if(this.phase==='ended')return true;}
        if(team==='ally')this.battleStep='enemy';
        else {this.turn++;this.battleStep='ally';this.allyMoved=null;for(const u of this.units){u.moved=0;u.effects=u.effects.filter(e=>e.expires>this.turn);}
          if(!this.allies.some(u=>this.legalMoves(u).length))this.finish('lose','味方が移動できなくなりました。');}
        return true;
      }
      if (this.battleStep === 'enemy') {
        this.log(`── ターン ${this.turn}：敵移動 → 敵攻撃 ──`);
        for (const u of this.units) u.effects = u.effects.filter(e => e.expires > this.turn);
        // 先に敵全員を移動し、その後で敵全員の攻撃を処理する。
        for (const plan of this.enemyPlan()) {
          const u = this.unit(plan.id);
          if (plan.breakthrough) { this.finish('lose', `${u.name}が0行目へ到達。自陣を突破されました。`); return true; }
          u.aiPrevious = { x: u.x,y: u.y };
          const farthest = u.aiFarthestY ?? u.y;
          u.aiStalls = plan.to.y > farthest ? 0 : (u.aiStalls || 0) + 1;
          u.aiFarthestY = Math.max(farthest,plan.to.y);
          u.x = plan.to.x; u.y = plan.to.y;
          if (u.y >= 6 && D.promotion[u.type] && !u.promoted) {
            u.promoted = true;
            this.log(`${label(u)}が自陣に侵入し、${D.promotion[u.type]}に成りました。`);
            this.events.push({id:u.id,text:'成り',kind:'buff'});
          }
        }
        for (const u of [...this.enemies]) { this.act(u); if (this.phase === 'ended') return true; }
        // 操作のために止める。移動を省略して味方攻撃へ進むこともできる。
        this.battleStep = 'ally';
        this.log(this.movementUnlocked ? '味方の行動。移動を決めてから味方攻撃を進めてください。' : '味方の行動。配置した駒が攻撃します。');
        return true;
      }
      this.log('── 味方攻撃 ──');
      for (const u of [...this.allies]) { this.act(u); if (this.phase === 'ended') return true; }
      // 一巡を耐え切ってから判定。12ターン目の敵攻撃で王が倒れた場合は既に敗北。
      if (this.kingDefense && this.turn >= D.defenseTurns) {
        if (this.checkAnnihilation()) return true;
        this.finish('win',`王将を守り、${D.defenseTurns}ターンの防衛を達成！`);
        this.result.victoryKind = 'survival';
        return true;
      }
      for (const u of this.allies) u.moved = 0;
      this.turn++;
      this.battleStep = 'enemy';
      return true;
    }
  }
  const api = { Game, createUnit, enemyArmy, actionsFor, planEnemyMoves };
  if (typeof module !== 'undefined') module.exports = api;
  else root.BanjinEngine = api;
})(typeof window === 'undefined' ? globalThis : window);
