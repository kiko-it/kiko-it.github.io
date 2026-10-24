import { drawGimmicks } from './gimmick-render.js';
import { WORLD, dotPosition } from './geometry.js';
import { routePosition } from './routing.js';

export function draw(canvas, game, debugTargets = false) {
  const palette = game.palette;
  const context = canvas.getContext('2d');
  const compact = canvas.dataset?.compact === 'true';
  const displayScale = compact ? Math.max(1, (canvas.getBoundingClientRect?.().width ?? WORLD.width) / WORLD.width) : 1;
  const ratio = Math.min((window.devicePixelRatio || 1) * displayScale, compact ? 4 : 2);
  const pictureBottom = game.geometry.top + game.stage.height * game.geometry.cell;
  const viewHeight = compact ? Math.min(WORLD.height, pictureBottom + 64) : WORLD.height;
  const width = Math.round(WORLD.width * ratio);
  const height = Math.round(viewHeight * ratio);
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, WORLD.width, WORLD.height);
  const expanded = game.geometry.layout === 'portrait';
  const boardWidth = expanded ? game.stage.width * game.geometry.cell : 344;
  const boardHeight = expanded ? game.stage.height * game.geometry.cell : 344;
  const boardLeft = expanded ? game.geometry.left : 28;
  const boardTop = expanded ? game.geometry.top : 24;
  // 盤面の背景は白にし、消去した場所も同じ白で表示する。
  context.fillStyle = '#ffffff';
  context.fillRect(boardLeft, boardTop, boardWidth, boardHeight);
  // ドット同士を見分けられるよう、マス間に小さな隙間を設ける。
  for (const dot of game.dots) {
    if (!dot.alive) continue;
    const position = dotPosition(dot, game.geometry);
    context.fillStyle = palette[dot.color].hex;
    const half = Math.max(0.2, (game.geometry.cell - 0.4) / 2);
    context.fillRect(position.x - half, position.y - half, half * 2, half * 2);
    if (debugTargets && dot.reserved) {
      context.strokeStyle = '#fff';
      context.lineWidth = 1;
      const marker = Math.min(3, half);
      context.strokeRect(position.x - marker, position.y - marker, marker * 2, marker * 2);
    }
  }
  drawGimmicks(context, game);
  for (const carrier of game.carriers) {
    const t = Math.min(1, (game.time - carrier.start) / (carrier.end - carrier.start));
    const { x, y } = routePosition(carrier.route, t);
    // 細かい盤面ではキャラも小さくし、空きマスの幅からはみ出さないようにする。
    const scale = Math.min(1, game.geometry.cell / 12);
    context.save();
    // 絵の下の運搬スペースだけを縮め、モデル上の経路・移動時間は維持する。
    const displayY = compact && y > pictureBottom
      ? pictureBottom + (y - pictureBottom) * (viewHeight - pictureBottom - 12) / (544 - pictureBottom)
      : y;
    context.translate(x, displayY);
    context.scale(scale, scale);
    const step = Math.sin(game.time * 24 + carrier.id) > 0 ? 0.5 : -0.5;
    context.fillStyle = '#314b48';
    context.fillRect(-3, -4, 6, 5);
    context.fillStyle = palette[carrier.color].hex;
    context.fillRect(-4, 1, 8, 3);
    context.fillStyle = '#fffaf0';
    context.fillRect(-2, -4, 2, 2);
    context.fillRect(1, -4, 2, 2);
    context.fillStyle = '#314b48';
    context.fillRect(-3, 4, 2, 1 + step);
    context.fillRect(1, 4, 2, 1 - step);
    context.restore();
  }
  for (const event of game.events) {
    const t = (game.time - event.time) / 0.4;
    context.globalAlpha = 1 - t;
    context.fillStyle = palette[event.color].hex;
    for (const direction of [-1, 1]) {
      context.fillRect(event.x + direction * t * 12, event.y - t * 12, 3, 3);
    }
  }
  context.globalAlpha = 1;
}
