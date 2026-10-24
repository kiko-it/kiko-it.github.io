import { readArea, readGimmicks } from './gimmicks.js';

function integer(value, min, max, label) {
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${label}が不正です`);
}

export function readArt(data) {
  if (data?.format !== 'pixel-tidy-art' || data.version !== 1) throw new Error('絵素材の形式が不正です');
  integer(data.width, 10, 128, '幅');
  integer(data.height, 10, 128, '高さ');
  if (!Array.isArray(data.palette) || data.palette.length < 1 || data.palette.length > 12) throw new Error('パレットが不正です');
  const palette = data.palette.map((color, index) => {
    if (!/^#[0-9a-f]{6}$/i.test(color?.hex)) throw new Error('色のHEX値が不正です');
    const name = typeof color.name === 'string' && color.name.length ? color.name.slice(0, 60) : `色${index + 1}`;
    return { name, hex: color.hex, ink: /^#[0-9a-f]{6}$/i.test(color.ink) ? color.ink : '#243b33' };
  });
  if (!Array.isArray(data.pixels) || data.pixels.length !== data.height
    || data.pixels.some(row => !Array.isArray(row) || row.length !== data.width)) throw new Error('マス配列の寸法が不正です');
  const colors = Array(palette.length).fill(0);
  const dots = data.pixels.flat().map((color, id) => {
    if (color !== null) { integer(color, 0, palette.length - 1, '色ID'); colors[color]++; }
    return { id, x: id % data.width, y: Math.floor(id / data.width), color: color ?? 0, alive: color !== null, reserved: false };
  });
  const dotCount = colors.reduce((sum, count) => sum + count, 0);
  if (dotCount < 1 || data.dotCount !== dotCount) throw new Error('実ドット数が一致しません');
  if (!Array.isArray(data.colorCounts) || data.colorCounts.length !== colors.length
    || colors.some((count, index) => data.colorCounts[index] !== count)) throw new Error('色別ドット数が一致しません');
  return { width: data.width, height: data.height, palette, dots, dotCount, source: data.source ?? {} };
}

export function readStage(data) {
  if (data?.format !== 'pixel-tidy-stage' || data.version !== 1) throw new Error('ステージの形式が不正です');
  integer(data.id, 1, 100, 'ステージ番号');
  integer(data.boxCount, 1, 8, '箱数');
  if (typeof data.name !== 'string' || !data.name.trim() || data.name.length > 200) throw new Error('ステージ名が不正です');
  const art = readArt(data.art);
  if (!Array.isArray(data.lanes) || ![4, 5].includes(data.lanes.length) || data.lanes.some(lane => !Array.isArray(lane))) throw new Error('レーンは4〜5つ必要です');
  const requests = Array(art.palette.length).fill(0);
  const tiles = new Map();
  const lanes = data.lanes.map((lane, laneIndex) => lane.map(tile => {
    integer(tile.id, 0, 1000000, 'タイルID');
    integer(tile.color, 0, art.palette.length - 1, 'タイル色');
    integer(tile.count, 1, art.dotCount, 'タイルの数字');
    if (tiles.has(tile.id)) throw new Error('タイルIDが重複しています');
    const item = { id: tile.id, color: tile.color, count: tile.count, lane: laneIndex };
    if (tile.region) item.region = readArea(tile.region, art);
    if (tile.after) {
      if (!Array.isArray(tile.after) || tile.after.length > 8 || new Set(tile.after).size !== tile.after.length) throw new Error('解法の待機条件が不正です');
      item.after = [...tile.after];
    }
    tiles.set(item.id, item);
    requests[item.color] += item.count;
    return item;
  }));
  if (requests.some((count, index) => count !== data.art.colorCounts[index])) throw new Error('タイル合計と絵の色別ドット数が一致しません');
  if (!Array.isArray(data.solution) || data.solution.length !== tiles.size) throw new Error('解法のタイル数が一致しません');
  const positions = Array(lanes.length).fill(0);
  const scheduled = new Set();
  const solution = data.solution.map(step => {
    integer(step.lane, 0, lanes.length - 1, '解法のレーン');
    const tile = lanes[step.lane][positions[step.lane]++];
    if (!tile || tile.id !== step.tileId) throw new Error('解法がレーンの先頭順と一致しません');
    if (tile.after?.some(id => !scheduled.has(id))) throw new Error('解法の待機先が前の手順にありません');
    scheduled.add(tile.id);
    return { ...tile };
  });
  if (data.autoplay !== undefined && !['serial', 'parallel'].includes(data.autoplay)) throw new Error('自動プレイ方式が不正です');
  if (data.difficulty) {
    integer(data.difficulty.level, 1, 10, '難易度');
    integer(data.difficulty.laneBlockSize, 1, 9, 'レーンの配分ブロック数');
  }
  const gimmicks = readGimmicks(data.gimmicks, art, tiles);
  const boardLayout = data.boardLayout ?? 'square';
  if (!['square', 'portrait'].includes(boardLayout)) throw new Error('盤面レイアウトが不正です');
  const parameters = data.parameters ?? {};
  const bounds = { speed: [60, 600], minTravel: [0.2, 3], maxTravel: [1, 6] };
  if (!parameters || typeof parameters !== 'object' || Array.isArray(parameters)
    || Object.entries(parameters).some(([key, value]) => !bounds[key] || !Number.isFinite(value) || value < bounds[key][0] || value > bounds[key][1])
    || (parameters.minTravel ?? 1) > (parameters.maxTravel ?? 3)) throw new Error('ステージの運搬設定が不正です');
  return { id: data.id, name: data.name, boxCount: data.boxCount, ...art, lanes, solution, gimmicks,
    boardLayout,
    parameters: { ...parameters },
    difficulty: data.difficulty ?? { level: 1, laneBlockSize: 1 }, autoplay: data.autoplay ?? 'serial' };
}

export function readCatalog(data) {
  if (data?.format !== 'pixel-tidy-stage-catalog' || data.version !== 1 || !Array.isArray(data.stages)) throw new Error('ステージ一覧の形式が不正です');
  const seen = new Set();
  return data.stages.map(entry => {
    integer(entry.id, 1, 100, '一覧のステージ番号');
    if (seen.has(entry.id)) throw new Error('一覧のステージ番号が重複しています');
    seen.add(entry.id);
    const expected = `stage-${String(entry.id).padStart(3, '0')}.json`;
    if (entry.file !== expected || typeof entry.name !== 'string') throw new Error('一覧のファイル名・名前が不正です');
    if (entry.difficultyLevel !== undefined) integer(entry.difficultyLevel, 1, 10, '一覧の難易度');
    return { id: entry.id, name: entry.name, file: expected, difficultyLevel: entry.difficultyLevel ?? 1 };
  }).sort((a, b) => a.id - b.id);
}
