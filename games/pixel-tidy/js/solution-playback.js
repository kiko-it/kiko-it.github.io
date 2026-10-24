// キーの露出待ちだけが残った場合は、直列解法でも次の仕事を選べる。
export function solutionReady(game, parallel = false, nextTile = null) {
  if (nextTile?.after?.some(id => game.boxes.some(box => box?.id === id) || game.lanes.some(lane => lane.some(tile => tile.id === id)))) return false;
  if (nextTile && !game.canSelect(nextTile.lane)) return false;
  if (game.pendingLinkIds.length && game.linkFor(nextTile)?.keys.includes(game.pendingLinkId)) return true;
  if (!game.boxes.includes(null)) return false;
  if (parallel || game.boxes.every(box => !box)) return true;
  return !game.carriers.length && !game.boxes.some((box, index) => box && game.nearest(box.color, index));
}

// 1枚目の選択だけではレーン枚数が変わらないため、IDで途中状態を照合する。
export function solutionMatches(game, index) {
  const remaining = new Set(game.lanes.flat().map(tile => tile.id));
  const selected = new Set(game.stage.solution.filter(tile => !remaining.has(tile.id)).map(tile => tile.id));
  for (const id of game.pendingLinkIds) selected.add(id);
  return selected.size === index && game.stage.solution.slice(0, index).every(tile => selected.has(tile.id));
}
