import { Game } from './model.js';
import { readArt, readStage } from './stage-data.js';
import { solutionReady } from './solution-playback.js';

export function verifySolution(stage, parallel = false) {
  const game = new Game(stage);
  let index = 0;
  // ドット数に比例した予算で、到達不能・順序矛盾による待機を検出する。
  const limit = Math.max(2000, stage.dotCount * 40);
  for (let tick = 0; tick < limit && game.status === 'playing'; tick++) {
    const ready = solutionReady(game, parallel, stage.solution[index]);
    if (ready && index < stage.solution.length) {
      const tile = stage.solution[index++];
      if (game.lanes[tile.lane][0]?.id !== tile.id || !game.select(tile.lane)) throw new Error('解法順でタイルを選択できません');
    }
    game.tick(0.1);
  }
  if (game.status !== 'won') throw new Error(`解法検証に失敗しました：${game.status}、残り${game.total - game.removed}ドット、手順${index}、箱${JSON.stringify(game.boxes.map(box => box && ({ id: box.id, color: box.color, remaining: box.remaining })))}`);
  return { time: Math.round(game.time * 10) / 10, removed: game.removed };
}

export function buildStage(artData, { id, name, boxCount = 5, tileSize = 30, difficulty = 1, boardLayout } = {}) {
  const art = readArt(artData);
  if (!Number.isInteger(tileSize) || tileSize < 1 || tileSize > 120) throw new Error('タイルサイズは1〜120です');
  if (!Number.isInteger(difficulty) || difficulty < 1 || difficulty > 10) throw new Error('難易度は1〜10です');
  const laneBlockSize = Math.max(1, difficulty - 1);
  const simulation = new Game({ ...art, boardLayout, boxCount, lanes: [[], [], [], []] });
  const lanes = [[], [], [], []];
  const solution = [];
  while (simulation.removed < simulation.total) {
    const field = simulation.routeField(0);
    const exposed = Array(art.palette.length).fill(0);
    for (const dot of simulation.dots) if (simulation.exposed(dot) && field.reachable(dot)) exposed[dot.color]++;
    const color = exposed.indexOf(Math.max(...exposed));
    const remaining = simulation.dots.filter(dot => dot.alive && dot.color === color).length;
    const tileId = solution.length;
    simulation.lanes[0] = [{ id: tileId, color, count: Math.min(tileSize, remaining) }];
    const before = simulation.removed;
    simulation.select(0);
    let ticks = 0;
    while (simulation.boxes[0] && simulation.status === 'playing' && ticks++ < 5000) simulation.tick(0.1);
    const count = simulation.removed - before;
    if (!count || ticks >= 5000) throw new Error('素材から解法を生成できませんでした');
    simulation.boxes[0] = null;
    simulation.status = 'playing';
    // 高い難易度では先の色が別レーンの先頭へ現れ、空き箱を残す先読みが必要になる。
    const lane = Math.floor(tileId / laneBlockSize) % 4;
    lanes[lane].push({ id: tileId, color, count });
    solution.push({ tileId, lane });
  }
  const data = { format: 'pixel-tidy-stage', version: 1, id, name, boxCount, art: artData, lanes, solution,
    difficulty: { level: difficulty, laneBlockSize } };
  if (boardLayout) data.boardLayout = boardLayout;
  const stage = readStage(data);
  // まず確実な直列解法を検証する。並行解法も通る場合のみ記録する。
  const validation = { serial: verifySolution(stage) };
  try { validation.parallel = verifySolution(stage, true); }
  catch { validation.parallel = null; }
  data.autoplay = validation.parallel ? 'parallel' : 'serial';
  data.validation = validation;
  return { data, validation };
}
