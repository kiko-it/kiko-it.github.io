import { pairAppearance } from './gimmick-render.js';

// ペアをタイルIDで照合する。画面外の相手にもレーンと深さを持たせる。
export function remainingLinks(lanes, gates) {
  const positions = new Map();
  lanes.forEach((tiles, lane) => tiles.forEach((tile, depth) => positions.set(tile.id, { tile, lane, depth })));
  return gates.flatMap((gate, index) => {
    if (!gate.paired) return [];
    const ends = gate.keys.map(id => positions.get(id));
    if (ends.some(end => !end) || ends.every(end => end.depth >= 3)) return [];
    ends.sort((a, b) => a.lane - b.lane);
    return [{ index, ends, ...pairAppearance(index) }];
  });
}

// 隣り合う同じ段は直接結び、それ以外はカードの脇と下端の余白を通す。
export function connectionPath(a, b, railY) {
  const direction = a.x < b.x ? 1 : -1;
  if (Math.abs(a.y - b.y) < 1 && Math.abs(a.x - b.x) < 24) return `M ${a.x} ${a.y} L ${b.x} ${b.y}`;
  const margin = Math.min(5, Math.abs(a.x - b.x) / 4);
  return `M ${a.x} ${a.y} H ${a.x + direction * margin} V ${railY} H ${b.x - direction * margin} V ${b.y} H ${b.x}`;
}

export class TileLinkRenderer {
  constructor(container, svg) {
    this.container = container;
    this.svg = svg;
    this.signature = '';
  }

  reset() {
    this.signature = '';
    this.svg.replaceChildren();
    this.svg.setAttribute('hidden', '');
  }

  render(game) {
    const links = remainingLinks(game.lanes, game.gimmicks.gates);
    const bounds = this.container.getBoundingClientRect();
    if (!links.length || !bounds.width || !bounds.height) { this.reset(); return; }
    const located = links.map(link => ({ ...link, selected: link.ends.some(end => (game.pendingLinkIds ?? [game.pendingLinkId]).includes(end.tile.id)),
      anchors: link.ends.map((end, index) => {
        const lane = this.container.querySelector('.lanes').children[end.lane];
        const peer = link.ends[index === 0 ? 1 : index - 1];
        if (end.depth < 3) {
          const tile = lane.querySelector(`[data-tile-id="${end.tile.id}"]`);
          const rect = tile.getBoundingClientRect();
          return { x: (end.lane < peer.lane ? rect.right : rect.left) - bounds.left,
            left: rect.left - bounds.left, right: rect.right - bounds.left,
            y: (rect.top + rect.bottom) / 2 - bounds.top, buried: false };
        }
        const rect = lane.getBoundingClientRect();
        return { x: (rect.left + rect.right) / 2 - bounds.left + (link.index % 3 - 1) * 17,
          y: bounds.height - 8, buried: true, depth: end.depth, fill: game.palette[end.tile.color].hex };
      }) }));
    const signature = JSON.stringify([bounds.width, bounds.height, located]);
    if (signature === this.signature) return;
    this.signature = signature;
    this.svg.removeAttribute('hidden');
    this.svg.setAttribute('viewBox', `0 0 ${bounds.width} ${bounds.height}`);
    const node = (name, attrs) => {
      const element = document.createElementNS('http://www.w3.org/2000/svg', name);
      for (const [key, value] of Object.entries(attrs)) element.setAttribute(key, String(value));
      return element;
    };
    const fragment = document.createDocumentFragment();
    for (const link of located) {
      const group = node('g', { class: link.selected ? 'tile-link selected' : 'tile-link', stroke: link.color });
      // 3枚は隣り合う端点を2本で結び、同じ色の線でひと組に見せる。
      for (let index = 1; index < link.anchors.length; index++) {
        const a = link.anchors[index - 1], b = link.anchors[index];
        group.append(node('path', { d: connectionPath({ ...a, x: a.right ?? a.x }, { ...b, x: b.left ?? b.x }, bounds.height - 3 - link.index % 3 * 4),
          fill: 'none', 'stroke-dasharray': a.buried || b.buried ? '4 3' : 'none' }));
      }
      for (const anchor of link.anchors) {
        if (anchor.buried) {
          // 正確な数値を追加せず、重なるカードと省略点で奥にあることを示す。
          const blockers = Math.min(3, Math.max(0, anchor.depth - 3));
          for (let offset = 1; offset <= blockers; offset++) group.append(node('path', {
            d: `M ${anchor.x - 6} ${anchor.y - 5 - offset * 3} h 12`, fill: 'none' }));
          group.append(node('rect', { x: anchor.x - 7, y: anchor.y - 5, width: 14, height: 10,
            rx: 2, fill: anchor.fill, 'stroke-width': 2 }));
          if (anchor.depth > 6) for (const dx of [-4, 0, 4]) group.append(node('circle', {
            cx: anchor.x + dx, cy: anchor.y - 18, r: 1, fill: link.color, stroke: 'none' }));
        } else group.append(node('circle', { cx: anchor.x, cy: anchor.y, r: 3, fill: '#fffdf5' }));
      }
      fragment.append(group);
    }
    // 線のSVGだけ交換し、押下中のカードの寿命を維持する。
    this.svg.replaceChildren(fragment);
  }
}
