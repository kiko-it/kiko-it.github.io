/* 駒・装備の定義。画像を使用せず、表示と戦闘が同じデータを参照する。 */
(function (root) {
  'use strict';
  const pieces = {
    pawn: { name: '歩兵', glyph: '歩', cost: 2, hp: 36, atk: 12, def: 3, matk: 8, mdef: 3, slots: 2, role: '前方を守る軽量兵' },
    lance: { name: '香車', glyph: '香', cost: 3, hp: 40, atk: 16, def: 4, matk: 10, mdef: 4, slots: 3, role: '縦一列を貫く射程' },
    knight: { name: '桂馬', glyph: '桂', cost: 3, hp: 38, atk: 8, def: 9, matk: 20, mdef: 7, slots: 3, attackAttr: 'magic', role: '物理攻撃を捨て、防御と魔法に特化した奇襲兵' },
    silver: { name: '銀将', glyph: '銀', cost: 4, hp: 50, atk: 18, def: 6, matk: 22, mdef: 6, slots: 3, attackAttr: 'magic', role: '斜め方向に強い魔法の遊撃兵' },
    gold: { name: '金将', glyph: '金', cost: 4, hp: 64, atk: 16, def: 10, matk: 12, mdef: 8, slots: 3, role: '堅牢な前線の要' },
    bishop: { name: '角行', glyph: '角', cost: 5, hp: 44, atk: 18, def: 5, matk: 24, mdef: 9, slots: 4, attackAttr: 'magic', role: '斜線を支配する魔法兵' },
    rook: { name: '飛車', glyph: '飛', cost: 5, hp: 58, atk: 23, def: 7, matk: 16, mdef: 6, slots: 4, role: '縦横に届く主力砲' },
    king: { name: '王将', glyph: '王', cost: 5, hp: 76, atk: 20, def: 9, matk: 20, mdef: 10, slots: 4, role: '周囲を支える指揮官' }
  };
  const equipment = {
    sword: { name: '刀', kind: '攻撃', action: 'attack', attr: 'physical', range: 'piece', power: 0, icon: '刀', description: '使い手の技で駒本来の範囲へ物理攻撃。貫通・遠見が有効。能力補正なし。' },
    staff: { name: '術印', kind: '攻撃', action: 'attack', attr: 'magic', range: 'piece', power: 0, icon: '印', description: '使い手の術で駒本来の範囲へ魔法攻撃。貫通・遠見が有効。能力補正なし。' },
    gauntlet: { name: '武者の籠手', kind: '能力', action: 'special', bonuses: { atk: 5 }, icon: '剛', description: '装備中、物攻 +5。攻撃方法は変わらない。' },
    armor: { name: '鉄胴', kind: '能力', action: 'special', bonuses: { def: 5 }, icon: '盾', description: '装備中、物防 +5。回復役の回復量も増える。' },
    grimoire: { name: '陰陽の秘伝書', kind: '能力', action: 'special', bonuses: { matk: 6 }, icon: '書', description: '装備中、魔攻 +6。魔法の通常攻撃や魔法攻撃装備を強化する。' },
    ward: { name: '守りの御守', kind: '能力', action: 'special', bonuses: { mdef: 5 }, icon: '護', description: '装備中、魔防 +5。回復役の回復量も増える。' },
    blade: { name: '打刀', kind: '攻撃', action: 'attack', attr: 'physical', range: 'piece', power: 5, icon: '⚔', description: '移動範囲へ物理攻撃。物攻 +5。' },
    flame: { slotCost: 2, name: '焔の術符', kind: '攻撃', action: 'attack', attr: 'magic', range: 'diamond2', power: 6, icon: '✦', description: '縦横の合計距離2以内の菱形へ魔法攻撃。斜め1マスを含み、斜め2マスは含まない。魔攻 +6。範囲は固定。' },
    bow: { name: '和弓', kind: '攻撃', action: 'attack', attr: 'physical', range: 'cross', power: 3, icon: '↟', description: '縦横3マスへ物理攻撃。物攻 +3。' },
    heal: { name: '癒しの鈴', kind: '回復', action: 'heal', range: 'radius2', icon: '＋', description: '縦横それぞれ±2マスの正方形にいる味方と自身を回復。回復量は使用者の物防＋魔防。' },
    banner: { name: '鼓舞の軍配', kind: 'バフ', action: 'buff', range: 'radius2', icon: '↑', description: '縦横それぞれ±2マスの正方形にいる味方と自身を強化。使用者の各基礎能力の20％（端数切り上げ）、2ターン。' },
    curse: { name: '弱化の呪符', kind: 'デバフ', action: 'debuff', range: 'radius2', icon: '↓', description: '縦横それぞれ±2マスの正方形にいる敵を弱化。使用者の各基礎能力の50％（端数切り上げ）、2ターン。' },
    healGreater: { slotCost: 2, name: '清祓の鈴', kind: '回復', action: 'heal', range: 'diamond4', icon: '祓', description: '縦横距離4以内の味方と自身を回復。回復量は物防＋魔防。2枠。' },
    bannerGreater: { slotCost: 2, name: '大将の軍配', kind: 'バフ', action: 'buff', range: 'diamond4', icon: '陣', description: '縦横距離4以内の味方と自身を強化。基礎能力の20％（切り上げ）、2ターン。2枠。' },
    curseGreater: { slotCost: 2, name: '縛陣の呪符', kind: 'デバフ', action: 'debuff', range: 'diamond4', icon: '縛', description: '縦横距離4以内の敵を弱化。基礎能力の50％（切り上げ）、2ターン。2枠。' },
    scope: { slotCost: 5, name: '遠見の勾玉', kind: '特殊', action: 'special', effect: 'range', icon: '◎', description: '駒本来の攻撃範囲を隣接1マス分広げる。刀・術印・鉄の刃に有効。広げた射線ごとに駒で遮られる。弓・札など道具固有の範囲は変えない。' },
    pierce: { slotCost: 3, name: '貫きの勾玉', kind: '特殊', action: 'special', effect: 'pierce', icon: '⇥', description: '駒本来の長距離攻撃が駒を貫通する。刀・術印・鉄の刃に有効。弓・札・移動・支援の範囲は変えない。' }
  };
  equipment.thunder={slotCost:2,name:'雷鳴の護符',kind:'攻撃',action:'attack',attr:'magic',range:'diamond3',power:4,icon:'雷',description:'縦横の合計距離3以内の菱形へ魔法攻撃。魔攻＋4。射程固定、2枠。'};
  equipment.bulwark={slotCost:2,name:'防貫の大盾',kind:'特殊',action:'special',effect:'blockPierce',icon:'盾',description:'貫通する射線をこの駒で止め、背後の駒を守る。装備者自身は通常通りダメージを受ける。2枠。'};
  const roster = ['pawn', 'lance', 'knight', 'silver', 'gold', 'rook', 'bishop', 'king'];
  const defaults = ['lance', 'bishop', 'rook', 'gold', 'pawn'];
  const positions = { lance: [1, 6], bishop: [3, 7], rook: [4, 6], gold: [6, 6], pawn: [7, 6], silver: [2, 7], knight: [5, 7], king: [4, 8] };
  const promotion = { pawn: 'と', lance: '杏', knight: '圭', silver: '全', bishop: '馬', rook: '龍' };
  const unitLimits = { pawn: 9, lance: 2, knight: 2, silver: 2, gold: 2, rook: 1, bishop: 1, king: 1 };
  const statNames = { hp: 'HP', atk: '物攻', def: '物防', matk: '魔攻', mdef: '魔防' };
  const bossStage = 40;
  const maxStage = 50;
  const slotRewardStages = [5, 10, 15, 20, 30, 40, 50];
  const kingDefense = stage => stage >= 21 && stage <= 40;
  const defenseTurns = 12;
  // 各駒が通常の移動を一度行うと完成する囲い。tools/build-castle-layouts.cjs --write で再生成。
  const castleLayouts = [
    {name:"美濃囲い",source:"https://shogicastle.com/ja/kakoi/mino-gakoi/",pieces:[["pawn",0,2,0,3],["pawn",8,2,8,2],["pawn",7,2,7,2],["pawn",6,2,6,2],["pawn",5,1,5,2],["pawn",4,2,4,2],["pawn",3,1,3,2],["pawn",2,2,2,2],["pawn",1,2,1,2],["bishop",7,1,7,1],["rook",6,1,5,1],["gold",4,1,4,1],["silver",3,2,2,1],["king",2,1,1,1],["lance",8,0,8,0],["knight",7,0,7,0],["silver",6,0,6,0],["gold",2,0,3,0],["knight",1,0,1,0],["lance",0,0,0,0]]},
    {name:"矢倉囲い",source:"https://shogicastle.com/ja/kakoi/yagura-gakoi/",pieces:[["pawn",6,2,6,3],["pawn",5,2,5,3],["pawn",8,1,8,2],["pawn",7,2,7,2],["silver",7,1,6,2],["gold",6,1,5,2],["pawn",4,1,4,2],["pawn",3,1,3,2],["pawn",2,2,2,2],["pawn",1,1,1,2],["pawn",0,1,0,2],["king",8,2,7,1],["gold",5,0,6,1],["bishop",4,0,5,1],["rook",2,1,1,1],["lance",8,0,8,0],["knight",7,0,7,0],["silver",2,0,2,0],["knight",1,0,1,0],["lance",0,0,0,0]]},
    {name:"舟囲い",source:"https://shogicastle.com/ja/kakoi/funa-gakoi/",pieces:[["pawn",8,2,8,3],["pawn",6,2,6,3],["pawn",4,2,4,3],["pawn",7,1,7,2],["pawn",5,2,5,2],["pawn",3,2,3,2],["pawn",2,2,2,2],["pawn",1,1,1,2],["pawn",0,1,0,2],["bishop",6,0,7,1],["king",7,2,6,1],["gold",4,0,4,1],["silver",3,0,3,1],["rook",2,1,1,1],["lance",8,0,8,0],["knight",7,0,7,0],["silver",5,1,6,0],["gold",5,0,5,0],["knight",1,0,1,0],["lance",0,0,0,0]]},
    {name:"穴熊囲い",source:"https://shogicastle.com/ja/kakoi/anaguma/",pieces:[["pawn",8,1,8,2],["pawn",7,2,7,2],["pawn",6,1,6,2],["pawn",5,2,5,2],["pawn",4,1,4,2],["pawn",3,2,3,2],["pawn",2,1,2,2],["pawn",1,2,1,2],["pawn",0,2,0,2],["bishop",6,2,7,1],["rook",5,0,5,1],["gold",3,1,2,1],["silver",2,2,1,1],["lance",0,0,0,1],["lance",8,0,8,0],["knight",7,0,7,0],["silver",7,1,6,0],["gold",3,0,2,0],["knight",1,0,1,0],["king",1,1,0,0]]},
    {name:"カニ囲い",source:"https://shogicastle.com/ja/kakoi/kani-gakoi/",pieces:[["pawn",6,2,6,3],["pawn",4,2,4,3],["pawn",8,1,8,2],["pawn",7,1,7,2],["pawn",5,2,5,2],["pawn",3,1,3,2],["pawn",2,2,2,2],["pawn",1,2,1,2],["pawn",0,1,0,2],["bishop",8,2,7,1],["gold",6,1,6,1],["silver",5,0,5,1],["gold",5,1,4,1],["silver",3,0,3,1],["rook",1,1,1,1],["lance",8,0,8,0],["knight",7,0,7,0],["king",6,0,5,0],["knight",1,0,1,0],["lance",0,0,0,0]]},
    {name:"elmo囲い",source:"https://shogicastle.com/ja/kakoi/elmo-gakoi/",pieces:[["pawn",1,2,1,3],["pawn",8,2,8,3],["pawn",6,2,6,3],["pawn",4,2,4,3],["pawn",7,2,7,2],["pawn",5,2,5,2],["silver",5,1,4,2],["pawn",3,2,3,2],["pawn",2,1,2,2],["pawn",0,2,0,2],["bishop",7,1,7,1],["king",5,0,6,1],["silver",6,0,5,1],["rook",3,1,1,1],["lance",8,0,8,0],["knight",7,0,7,0],["gold",6,1,6,0],["gold",3,0,4,0],["knight",1,0,1,0],["lance",0,0,0,0]]},
    {name:"中住まい",source:"https://shogicastle.com/ja/kakoi/nakazumai/",pieces:[["pawn",6,2,6,3],["pawn",8,2,8,2],["pawn",7,2,7,2],["pawn",5,2,5,2],["pawn",4,2,4,2],["pawn",3,2,3,2],["pawn",2,2,2,2],["pawn",1,2,1,2],["pawn",0,2,0,2],["bishop",6,0,7,1],["gold",6,1,6,1],["king",5,0,4,1],["silver",4,0,3,1],["gold",2,0,2,1],["rook",0,1,1,1],["lance",8,0,8,0],["knight",7,0,7,0],["silver",5,1,6,0],["knight",1,0,1,0],["lance",0,0,0,0]]},
    {name:"中原囲い",source:"https://shogicastle.com/ja/kakoi/nakahara-gakoi/",pieces:[["pawn",6,2,6,3],["pawn",8,2,8,2],["pawn",7,2,7,2],["pawn",5,2,5,2],["pawn",4,2,4,2],["pawn",3,2,3,2],["pawn",2,2,2,2],["pawn",1,2,1,2],["pawn",0,2,0,2],["bishop",7,1,7,1],["gold",6,0,6,1],["silver",3,1,3,1],["rook",1,1,1,1],["lance",8,0,8,0],["knight",7,0,7,0],["silver",5,1,6,0],["king",4,0,5,0],["gold",3,0,4,0],["knight",1,0,1,0],["lance",0,0,0,0]]},
    {name:"金無双",source:"https://shogicastle.com/ja/kakoi/kinmuso/",pieces:[["pawn",0,2,0,3],["pawn",8,2,8,2],["pawn",7,2,7,2],["pawn",6,1,6,2],["pawn",5,1,5,2],["pawn",4,2,4,2],["pawn",3,2,3,2],["pawn",2,1,2,2],["pawn",1,1,1,2],["bishop",7,1,7,1],["rook",4,1,5,1],["gold",3,0,4,1],["gold",3,1,3,1],["king",1,2,2,1],["silver",2,0,1,1],["lance",8,0,8,0],["knight",7,0,7,0],["silver",6,0,6,0],["knight",1,0,1,0],["lance",0,0,0,0]]}
  ];
  function castleFormation(stage) {
    if(stage<22||stage>39)return null;
    const base=castleLayouts[(stage-22)%9];
    const pieces=base.pieces.map(p=>[...p]);
    return {name:base.name,source:base.source,pieces};
  }
  const equipmentSlots = (type, level = 1, slotBonus = 0) => pieces[type].slots + slotBonus;
  const equipmentCost = id => equipment[id]?.slotCost || 1;
  const usedSlots = items => items.reduce((sum, id) => sum + equipmentCost(id), 0);
  const api = { equipmentCost, usedSlots, pieces, equipment, roster, defaults, positions, promotion, unitLimits, statNames, bossStage, maxStage, slotRewardStages, equipmentSlots, kingDefense, defenseTurns, castleFormation };
  if (typeof module !== 'undefined') module.exports = api;
  else root.BanjinData = api;
})(typeof window === 'undefined' ? globalThis : window);
