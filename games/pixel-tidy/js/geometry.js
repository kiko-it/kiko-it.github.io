// モデル・解法生成・経路探索・描画が共有する論理座標。
export const WORLD = { width: 400, height: 560, left: 28, top: 24, cell: 344 / 30 };
export function boardGeometry(width, height, layout = 'square') {
  if (layout === 'portrait') {
    // 縦長の絵は下部の空白を使って拡大し、箱までの運搬空間を残す。
    const cell = Math.min(376 / width, 468 / height);
    return { ...WORLD, cell, left: (WORLD.width - width * cell) / 2, top: 12, layout };
  }
  const cell = 344 / Math.max(width, height);
  return { ...WORLD, cell, left: (WORLD.width - width * cell) / 2, top: 24 + (344 - height * cell) / 2, layout };
}
export const boxPosition = (index, count = 4) => ({ x: 18 + (index + 0.5) * 364 / count, y: 544 });
export const dotPosition = (dot, geometry = WORLD) => ({
  x: geometry.left + (dot.x + 0.5) * geometry.cell,
  y: geometry.top + (dot.y + 0.5) * geometry.cell,
});
