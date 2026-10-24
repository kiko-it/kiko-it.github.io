// 連携の対応線に使う色と形、および霧の残り個数を描画する。
export function pairAppearance(index) {
  const colors = ['#258e74', '#be8228', '#6b78bc', '#b56586'];
  const symbols = ['●', '◆', '▲', '♥'];
  return { color: colors[index % colors.length], symbol: symbols[index % symbols.length] };
}
export const pairSymbol = index => pairAppearance(index).symbol;

export function drawGimmicks(context, game) {
  const geometry = game.geometry;
  const rect = area => ({ x: geometry.left + area.x * geometry.cell, y: geometry.top + area.y * geometry.cell,
    width: area.width * geometry.cell, height: area.height * geometry.cell });
  const stamp = (symbol, x, y, color = '#425b70', size = 12) => {
    context.fillStyle = color;
    context.font = `${size}px sans-serif`;
    context.textAlign = 'center';
    context.fillText(symbol, x, y);
  };
  const fade = item => item.open ? Math.max(0, 1 - (game.time - item.openedAt) / 0.6) : 1;

  for (const item of game.gimmicks.fog) {
    const alpha = fade(item);
    if (!alpha) continue;
    const r = rect(item.area);
    context.globalAlpha = alpha;
    context.fillStyle = '#dedede';
    context.fillRect(r.x, r.y, r.width, r.height);
    const center = r.y + r.height / 2;
    stamp('☁', r.x + r.width / 2, center - 24, '#7693aa', 26);
    // 色の四角と残り個数を霧の上に表示し、片付ける対象を直接示す。
    item.requirements.forEach(({ color, count, removed }, index) => {
      const y = center - 8 + index * 24;
      // 細い霧区画でも条件が隣の区画へはみ出さないよう、幅に合わせて縮める。
      const rowWidth = Math.min(68, r.width - 8);
      const size = Math.min(14, Math.max(8, rowWidth * 0.25));
      const font = Math.min(16, Math.max(10, rowWidth * 0.26));
      const x = r.x + (r.width - rowWidth) / 2;
      context.fillStyle = game.palette[color].hex;
      context.fillRect(x, y + 1, size, size);
      context.strokeStyle = '#425b70';
      context.lineWidth = 1;
      context.strokeRect(x, y + 1, size, size);
      stamp(removed >= count ? '✓' : String(count - removed), x + size + (rowWidth - size) / 2, y + 14, '#354c60', font);
    });
    context.globalAlpha = 1;
  }
  for (const [index, gate] of game.gimmicks.gates.entries()) {
    if (gate.open || gate.laneOnly) continue;
    const r = rect(gate.area);
    context.strokeStyle = pairAppearance(index).color;
    context.lineWidth = 2;
    context.strokeRect(r.x, r.y, r.width, r.height);
    stamp(pairSymbol(index), r.x + r.width / 2, r.y + 16, pairAppearance(index).color, 16);
  }
}
