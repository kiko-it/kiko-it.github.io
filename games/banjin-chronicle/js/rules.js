/* 将棋の移動・遮蔽・装備の効果範囲を扱う純粋関数。 */
(function (root) {
  'use strict';
  const D = typeof module !== 'undefined' ? require('./data.js') : root.BanjinData;
  const inside = (x, y) => x >= 0 && x < 9 && y >= 0 && y < 9;
  const at = (units, x, y) => units.find(u => u.hp > 0 && u.x === x && u.y === y);
  const key = (x, y) => `${x},${y}`;

  function directions(unit) {
    // yは画面上ほど小さく、味方の前方は-1、敵の前方は+1。
    const f = unit.team === 'ally' ? -1 : 1;
    const gold = [[0, f], [-1, f], [1, f], [-1, 0], [1, 0], [0, -f]];
    const orthogonal = [[0, -1], [0, 1], [-1, 0], [1, 0]];
    const diagonal = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
    let type = unit.type;
    if (unit.promoted && ['pawn', 'lance', 'knight', 'silver'].includes(type)) type = 'gold';
    if (type === 'pawn') return { steps: [[0, f]], rays: [] };
    if (type === 'lance') return { steps: [], rays: [[0, f]] };
    if (type === 'knight') return { steps: [[-1, 2 * f], [1, 2 * f]], rays: [] };
    if (type === 'silver') return { steps: [[0, f], [-1, f], [1, f], [-1, -f], [1, -f]], rays: [] };
    if (type === 'gold') return { steps: gold, rays: [] };
    if (type === 'bishop') return { steps: unit.promoted ? orthogonal : [], rays: diagonal };
    if (type === 'rook') return { steps: unit.promoted ? diagonal : [], rays: orthogonal };
    return { steps: [...orthogonal, ...diagonal], rays: [] };
  }

  function pieceRange(unit, units) {
    const { steps, rays } = directions(unit);
    const result = [];
    for (const [dx, dy] of steps) {
      if (inside(unit.x + dx, unit.y + dy)) result.push([unit.x + dx, unit.y + dy]);
    }
    // 長距離の駒は最初の占有マスまで届き、その先には届かない。
    for (const [dx, dy] of rays) {
      for (let n = 1; n < 9; n++) {
        const x = unit.x + dx * n, y = unit.y + dy * n;
        if (!inside(x, y)) break;
        result.push([x, y]);
        if (at(units, x, y)) break;
      }
    }
    return result;
  }

  function moves(unit, units) {
    return pieceRange(unit, units).filter(([x, y]) => !at(units, x, y));
  }

  function canBreakthrough(unit) {
    // 10行目への突破は9行目からの前進のみ。長距離移動による盤外飛び出しは不可。
    if (unit.team !== 'ally' || unit.y !== 0) return false;
    const d = directions(unit);
    return [...d.steps, ...d.rays].some(([dx, dy]) => dx === 0 && dy === -1);
  }

  function scopedRays(unit, rays, units, limit) {
    const points = [];
    // 広げた射線を個別にたどる。中央の遮蔽物で隣の射線まで止めない。
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
      const sx = unit.x + ox, sy = unit.y + oy;
      if (!inside(sx, sy)) continue;
      const origin = at(units, sx, sy);
      if (origin && origin.id !== unit.id) continue;
      for (const [dx, dy] of rays) {
        for (let n = 1; n <= limit; n++) {
          const x = sx + dx * n, y = sy + dy * n;
          if (!inside(x, y)) break;
          points.push([x, y]);
          const blocker = at(units, x, y);
          if (blocker && blocker.id !== unit.id) {
            break;
          }
        }
      }
    }
    return points;
  }

  function actionRange(unit, item, units) {
    const nativeAttack = !item || (item.action === 'attack' && item.range === 'piece');
    const rayUnits = nativeAttack && unit.equipment.includes('pierce') ? units.filter(u=>u.equipment.includes('bulwark')) : units;
    let points = [];
    if (!item || item.range === 'piece') points = pieceRange(unit, rayUnits);
    else if (item.range === 'cross') {
      for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
        for (let n = 1; n <= 3; n++) {
          const x = unit.x + dx * n, y = unit.y + dy * n;
          if (!inside(x, y)) break;
          points.push([x, y]);
          if (at(rayUnits, x, y)) break;
        }
      }
    } else if (item.range === 'diamond2' || item.range === 'diamond3' || item.range === 'diamond4') {
      const radius = item.range === 'diamond4' ? 4 : item.range==='diamond3'?3:2;
      for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
        if (Math.abs(dx) + Math.abs(dy) <= radius && (dx || dy) && inside(unit.x + dx, unit.y + dy)) points.push([unit.x + dx, unit.y + dy]);
      }
    } else {
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        if (inside(unit.x + dx, unit.y + dy) && (dx || dy)) points.push([unit.x + dx, unit.y + dy]);
      }
    }
    if (item && ['heal', 'buff'].includes(item.action)) points.push([unit.x, unit.y]);
    if (nativeAttack && unit.equipment.includes('scope')) {
      // 駒本来の攻撃だけを拡張する。弓・札など道具固有の範囲は固定。
      const original = [...points];
      for (const [x, y] of original) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (inside(x + dx, y + dy)) points.push([x + dx, y + dy]);
      }
      if (!item || item.range === 'piece') {
        const d = directions(unit);
        if (d.rays.length) {
          points = scopedRays(unit, d.rays, rayUnits, 8);
          for (const [dx, dy] of d.steps) for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
            const x = unit.x + dx + ox, y = unit.y + dy + oy;
            if (inside(x, y)) points.push([x, y]);
          }
        }
      }
    }
    const unique = new Map(points.map(p => [key(...p), p]));
    return [...unique.values()];
  }

  function stats(unit) {
    const values = { atk: unit.atk, def: unit.def, matk: unit.matk, mdef: unit.mdef };
    for (const id of unit.equipment) for (const [name, amount] of Object.entries(D.equipment[id].bonuses || {})) values[name] += amount;
    for (const effect of unit.effects) {
      for (const name of Object.keys(values)) {
        const amount = effect.values?.[name] ?? effect.power ?? 0;
        if (effect.kind === 'buff') values[name] += amount;
        if (effect.kind === 'debuff') values[name] -= amount;
      }
    }
    for (const name of Object.keys(values)) values[name] = Math.max(0, values[name]);
    return values;
  }

  function damage(source, target, attr, power = 0) {
    const a = stats(source), b = stats(target);
    return Math.max(0, (attr === 'magic' ? a.matk - b.mdef : a.atk - b.def) + power);
  }
  function supportValues(unit, action = 'debuff') {
    // 基礎値＋恒久強化を参照し、バフによるバフの増幅を避ける。
    const base = stats({ ...unit, effects: [] });
    const rate = action === 'buff' ? .2 : .5;
    return Object.fromEntries(['atk', 'def', 'matk', 'mdef'].map(name => [name, base[name] > 0 ? Math.ceil(base[name] * rate) : 0]));
  }
  const api = { inside, at, key, directions, pieceRange, moves, canBreakthrough, actionRange, stats, damage, supportValues };
  if (typeof module !== 'undefined') module.exports = api;
  else root.BanjinRules = api;
})(typeof window === 'undefined' ? globalThis : window);
