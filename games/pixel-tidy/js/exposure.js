export function isExposed(dots, width, height, dot) {
  if (!dot.alive) return false;
  // 斜めの空きも露出とみなす。予約中のドットはまだ残っている。
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const x = dot.x + dx;
      const y = dot.y + dy;
      if (x < 0 || y < 0 || x >= width || y >= height) return true;
      if (!dots[y * width + x].alive) return true;
    }
  }
  return false;
}
