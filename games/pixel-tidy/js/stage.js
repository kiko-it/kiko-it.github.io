import { Game } from './model.js';
export { WORLD, boxPosition, dotPosition } from './geometry.js';
export { isExposed } from './exposure.js';

// 色名を併記して、似た色でもタイルを区別できるようにする。
export const PALETTE = [
  { name: 'ミント', hex: '#5dc8b2', ink: '#123e36' },
  { name: 'そら', hex: '#80b9e8', ink: '#193c65' },
  { name: 'もも', hex: '#ed92ab', ink: '#622c41' },
  { name: 'レモン', hex: '#f4d46b', ink: '#58471b' },
  { name: 'すみれ', hex: '#ab9bdd', ink: '#382d61' },
  { name: 'みかん', hex: '#eeab77', ink: '#61391c' },
  { name: 'ミルク', hex: '#f4e9cf', ink: '#605642' },
  { name: 'インク', hex: '#44556a', ink: '#ffffff' },
];

export function createStage() {
  const width = 30;
  const height = 30;
  const dots = Array.from({ length: width * height }, (_, id) => {
    const x = id % width;
    const y = Math.floor(id / width);
    const depth = Math.min(x, y, width - 1 - x, height - 1 - y);
    // 緑は平坦な1マス幅の枠。内側の帯と8×8のねこを残す。
    let color = Math.min(6, Math.floor((depth + 1) / 2));
    // 多層のラグの中央に、耳・目・鼻・ひげを持つねこを描く。
    if (depth >= 11) {
      color = 6;
      const ear = (y === 11 || y === 12) && ((x >= 11 && x <= 12) || (x >= 17 && x <= 18));
      const eye = y === 14 && (x === 12 || x === 17);
      const nose = y === 16 && x >= 14 && x <= 15;
      const mouth = y === 18 && x >= 13 && x <= 16;
      const whisker = y === 16 && (x === 11 || x === 18);
      if (ear || eye || nose || mouth || whisker) color = 7;
    }
    return { id, x, y, color, alive: true, reserved: false };
  });
  const simulation = new Game({ width, height, dots, lanes: [[], [], [], []], boxCount: 4 }, { dispatchAll: false });
  const solution = [];
  let milkPlaced = false;
  // 30ドット単位に分け、次の必要色と空き箱を細かく考える並びにする。
  while (simulation.removed < simulation.total) {
    const counts = PALETTE.map(() => 0);
    const field = simulation.routeField(0);
    for (const dot of simulation.dots) {
      if (simulation.exposed(dot) && field.reachable(dot)) counts[dot.color]++;
    }
    const color = counts.indexOf(Math.max(...counts));
    const available = simulation.dots.filter(dot => dot.alive && dot.color === color).length;
    simulation.lanes[0] = [{ id: solution.length, color, count: Math.min(30, available) }];
    const before = simulation.removed;
    simulation.select(0);
    // 予約・移動・到着による露出変化もモデルに任せ、実際に消せた数をタイルにする。
    let ticks = 0;
    while (simulation.boxes[0] && simulation.status === 'playing' && ticks++ < 1000) simulation.tick(0.1);
    if (ticks >= 1000) throw new Error('解法シミュレーションが停止しました');
    const count = simulation.removed - before;
    if (count === 0) throw new Error('解法生成に失敗しました');
    // 30未満で露出待ちになった部分は端数として確定し、次の必要色へ進む。
    simulation.boxes[0] = null;
    simulation.status = 'playing';
    const id = solution.length;
    // 連続した同色を同じレーンへ並べず、必要な色を取り出す順番を作る。
    const distribution = milkPlaced ? [0, 1, 2, 3, 1, 0, 3, 2] : [1, 2];
    let lane = distribution[id % distribution.length];
    // 最初のミントの後にレモンを見せ、同じレーンの連打で空きを失う配置にする。
    if (!milkPlaced && (id === 0 || color === 3)) lane = 0;
    // 第4レーンは内側のミルクから開始し、それ以前の解法は他の3レーンへ配分する。
    if (!milkPlaced && color === 6) {
      lane = 3;
      milkPlaced = true;
    }
    solution.push({ id, color, count, lane });
  }
  const lanes = Array.from({ length: 4 }, (_, lane) => solution.filter(tile => tile.lane === lane));
  const dotCount = dots.filter(dot => dot.alive).length;
  return { id: 1, name: 'ねこのお片付けラグ', boxCount: 4, palette: PALETTE, width, height, dots, dotCount, lanes, solution };
}
