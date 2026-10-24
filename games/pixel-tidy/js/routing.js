import { WORLD, dotPosition } from './geometry.js';

const DIRECTIONS = [[0, 1], [-1, 0], [1, 0], [0, -1]];

export function buildRouteField(dots, width, height, origin, geometry = WORLD) {
  // 絵の外周1マス分を歩道にする。上下左右のみで角のすり抜けを防ぐ。
  const stride = width + 2;
  const size = stride * (height + 2);
  const index = (x, y) => (y + 1) * stride + x + 1;
  const point = id => ({ x: id % stride - 1, y: Math.floor(id / stride) - 1 });
  const startX = Math.max(0, Math.min(width - 1, Math.floor((origin.x - geometry.left) / geometry.cell)));
  const start = index(startX, height);
  const parents = new Int32Array(size).fill(-1);
  const distances = new Int32Array(size).fill(-1);
  const queue = [start];
  distances[start] = 0;
  for (let head = 0; head < queue.length; head++) {
    const current = queue[head];
    const p = point(current);
    for (const [dx, dy] of DIRECTIONS) {
      const x = p.x + dx;
      const y = p.y + dy;
      if (x < -1 || y < -1 || x > width || y > height) continue;
      const next = index(x, y);
      if (distances[next] >= 0) continue;
      if (x >= 0 && y >= 0 && x < width && y < height && dots[y * width + x].alive) continue;
      distances[next] = distances[current] + 1;
      parents[next] = current;
      queue.push(next);
    }
  }

  function entrance(dot) {
    let best = -1;
    for (const [dx, dy] of DIRECTIONS) {
      const next = index(dot.x + dx, dot.y + dy);
      if (distances[next] >= 0 && (best < 0 || distances[next] < distances[best])) best = next;
    }
    return best;
  }

  return {
    reachable: dot => entrance(dot) >= 0,
    routeTo(dot) {
      let cursor = entrance(dot);
      if (cursor < 0) return null;
      const cells = [];
      while (cursor >= 0) {
        cells.push(point(cursor));
        cursor = parents[cursor];
      }
      cells.reverse();
      const position = cell => dotPosition(cell, geometry);
      const startPoint = position(cells[0]);
      // 箱から外周までは盤面下部の空き空間を通る。
      const points = [origin, { x: startPoint.x, y: origin.y }, ...cells.map(position), position(dot)];
      const segments = [];
      let length = 0;
      for (let i = 1; i < points.length; i++) {
        const distance = Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
        if (distance === 0) continue;
        segments.push({ from: points[i - 1], to: points[i], start: length, length: distance });
        length += distance;
      }
      return { points, cells, segments, length };
    },
  };
}

export function routePosition(route, fraction) {
  const distance = Math.max(0, Math.min(1, fraction)) * route.length;
  const segment = route.segments.find(item => distance <= item.start + item.length) || route.segments.at(-1);
  const t = Math.min(1, (distance - segment.start) / segment.length);
  return { x: segment.from.x + (segment.to.x - segment.from.x) * t,
    y: segment.from.y + (segment.to.y - segment.from.y) * t };
}
