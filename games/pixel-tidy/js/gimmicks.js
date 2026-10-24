// ギミックの範囲は絵の整数マスで管理し、表示と運搬判定で同じ条件を使う。
export const inside = (dot, area) => dot.x >= area.x && dot.y >= area.y
  && dot.x < area.x + area.width && dot.y < area.y + area.height;

export function readArea(area, art) {
  if (!area || !['x', 'y', 'width', 'height'].every(key => Number.isInteger(area[key]))
    || area.x < 0 || area.y < 0 || area.width < 1 || area.height < 1
    || area.x + area.width > art.width || area.y + area.height > art.height) throw new Error('ギミック領域が不正です');
  return { x: area.x, y: area.y, width: area.width, height: area.height };
}

export function readGimmicks(data, art, tiles) {
  if (!data) return { gates: [], fog: [], doors: [], ice: [] };
  if (!Array.isArray(data.gates) || !Array.isArray(data.fog) || data.gates.length > 10 || data.fog.length > 10) throw new Error('ギミック設定が不正です');
  const gates = data.gates.map((gate, index) => {
    const laneOnly = gate.laneOnly === true;
    if (gate.laneOnly !== undefined && typeof gate.laneOnly !== 'boolean') throw new Error('連携の配置設定が不正です');
    const area = laneOnly ? null : readArea(gate.area, art);
    if (!Array.isArray(gate.keys) || gate.keys.length < 2 || gate.keys.length > 3 || new Set(gate.keys).size !== gate.keys.length) throw new Error('連携キーが不正です');
    const keys = gate.keys.map(id => tiles.get(id));
    if (keys.some(tile => !tile || (laneOnly ? Boolean(tile.region) : !tile.region || JSON.stringify(tile.region) !== JSON.stringify(area)))
      || new Set(keys.map(tile => tile.color)).size !== keys.length) throw new Error('連携キーの色・領域が不正です');
    if (gate.paired !== undefined && typeof gate.paired !== 'boolean') throw new Error('連携の投入設定が不正です');
    if (gate.paired && new Set(keys.map(tile => tile.lane)).size !== keys.length) throw new Error('同時投入の連携は別レーンに配置してください');
    if (laneOnly && !gate.paired) throw new Error('レーン内連携は同時投入です');
    return { area, laneOnly, keys: [...gate.keys], paired: gate.paired ?? false, name: `連携${index + 1}`, colors: keys.map(tile => tile.color) };
  });
  const allKeys = gates.flatMap(gate => gate.keys);
  if (new Set(allKeys).size !== allKeys.length) throw new Error('連携キーが重複しています');
  // 先頭に残る連携同士が、互いの相手を塞ぐ循環配置を拒否する。
  const owners = new Map(gates.flatMap((gate, index) => gate.paired ? gate.keys.map(id => [id, index]) : []));
  const dependencies = gates.map(() => new Set());
  const preceding = Array.from({ length: Math.max(4, ...[...tiles.values()].map(tile => tile.lane + 1)) }, () => new Set());
  for (const tile of tiles.values()) {
    const owner = owners.get(tile.id);
    if (owner === undefined) continue;
    for (const prior of preceding[tile.lane]) if (prior !== owner) dependencies[owner].add(prior);
    preceding[tile.lane].add(owner);
  }
  const visited = new Set(), visiting = new Set();
  const visit = index => {
    if (visiting.has(index)) throw new Error('連携の入れ子に循環があります');
    if (visited.has(index)) return;
    visiting.add(index);
    for (const dependency of dependencies[index]) visit(dependency);
    visiting.delete(index);
    visited.add(index);
  };
  gates.forEach((_, index) => visit(index));
  const fog = data.fog.map((item, index) => {
    if (!Array.isArray(item.requirements) || item.requirements.length < 1 || item.requirements.length > 2) throw new Error('霧の指定色は1〜2色です');
    const requirements = item.requirements.map(({ color, count }) => {
      if (!Number.isInteger(color) || color < 0 || color >= art.palette.length
        || !Number.isInteger(count) || count < 1 || count > art.dots.filter(dot => dot.alive && dot.color === color).length) throw new Error('霧の色・必要個数が不正です');
      return { color, count };
    });
    if (new Set(requirements.map(item => item.color)).size !== requirements.length) throw new Error('霧の指定色が重複しています');
    return { area: readArea(item.area, art), requirements, name: `霧${index + 1}` };
  });
  const obstacles = (items, label) => {
    if (!Array.isArray(items) || items.length > 10) throw new Error(`${label}の設定が不正です`);
    return items.map((item, index) => {
      if (!Number.isFinite(item.threshold) || item.threshold <= 0 || item.threshold > 1) throw new Error(`${label}の解除率が不正です`);
      return { area: readArea(item.area, art), trigger: readArea(item.trigger, art), threshold: item.threshold, name: `${label}${index + 1}` };
    });
  };
  // 覆いがつながって見えないよう、辺だけでなく角の隣接も拒否する。
  for (let index = 0; index < fog.length; index++) for (const peer of fog.slice(index + 1)) {
    const a = fog[index].area, b = peer.area;
    if (a.x <= b.x + b.width && b.x <= a.x + a.width
      && a.y <= b.y + b.height && b.y <= a.y + a.height) throw new Error('霧の区画は隣接・重複できません。間に1マス以上空けてください');
  }
  return { gates, fog, doors: obstacles(data.doors ?? [], '扉'), ice: obstacles(data.ice ?? [], '氷') };
}

export class GimmickState {
  constructor(game) {
    this.game = game;
    this.gates = (game.stage.gimmicks?.gates ?? []).map(gate => ({ ...gate, open: false }));
    const triggered = (items, isIce = false) => items.map(item => {
      const triggerIds = game.dots.filter(dot => dot.alive && inside(dot, item.trigger) && (!isIce || !inside(dot, item.area))).map(dot => dot.id);
      return { ...item, open: false, openedAt: null, progress: 0, total: triggerIds.length, triggerIds };
    });
    this.fog = (game.stage.gimmicks?.fog ?? []).map(item => ({ ...item, open: false, openedAt: null, progress: 0,
      requirements: item.requirements.map(requirement => ({ ...requirement, removed: 0 })) }));
    this.doors = triggered(game.stage.gimmicks?.doors ?? []);
    this.ice = triggered(game.stage.gimmicks?.ice ?? [], true);
    this.obstacles = [...this.fog, ...this.doors, ...this.ice];
    this.lastRemoved = -1;
  }

  allows(dot, box) {
    if (box?.region && !inside(dot, box.region)) return false;
    return !this.gates.some(gate => !gate.laneOnly && !gate.open && inside(dot, gate.area))
      && !this.obstacles.some(item => !item.open && inside(dot, item.area));
  }

  update() {
    const game = this.game;
    for (const gate of this.gates) {
      if (!gate.open && gate.keys.every(id => game.boxes.some(box => box?.id === id))) {
        gate.open = true;
        game.revision++;
      }
    }
    // 消去数が変わったときだけ解除用領域を集計する。
    if (this.lastRemoved === game.removed) return;
    this.lastRemoved = game.removed;
    // 初期に存在したドットの消去だけを色別に数える。投入や予約は達成扱いにしない。
    const removedByColor = Array(game.palette?.length ?? 0).fill(0);
    if (this.fog.length) for (const dot of game.dots) if (game.stage.dots[dot.id].alive && !dot.alive) removedByColor[dot.color]++;
    for (const item of this.obstacles) {
      if (item.requirements) {
        for (const requirement of item.requirements) requirement.removed = removedByColor[requirement.color];
        item.progress = Math.min(...item.requirements.map(requirement => requirement.removed / requirement.count), 1);
      } else item.progress = item.total ? item.triggerIds.filter(id => !game.dots[id].alive).length / item.total : 1;
      if (!item.open && item.progress + 1e-9 >= (item.requirements ? 1 : item.threshold)) {
        item.open = true;
        item.openedAt = game.time;
        game.revision++;
      }
    }
  }
}
