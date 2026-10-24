import { boxPosition, dotPosition, boardGeometry } from './geometry.js';
import { isExposed } from './exposure.js';
import { buildRouteField } from './routing.js';
import { GimmickState } from './gimmicks.js';

export const DEFAULT_PARAMS = {
  // interval/maxCarriersは旧Stage 1生成の互換値。通常プレイには適用しない。
  interval: 0.1, speed: 180, maxCarriers: 10, minTravel: 1, maxTravel: 3, timeScale: 1,
};

export class Game {
  constructor(stage, { boxCount = stage.boxCount ?? 4, dispatchAll = true } = {}) {
    if (!Number.isInteger(boxCount) || boxCount < 1 || boxCount > 8) throw new Error('箱数は1〜8の整数です');
    this.stage = stage;
    this.geometry = boardGeometry(stage.width, stage.height, stage.boardLayout);
    this.palette = stage.palette ?? null;
    this.dots = stage.dots.map(dot => ({ ...dot }));
    this.total = this.dots.filter(dot => dot.alive).length;
    this.lanes = stage.lanes.map(lane => lane.map(tile => ({ ...tile })));
    this.boxes = Array.from({ length: boxCount }, () => null);
    this.routeFields = [];
    this.carriers = [];
    this.events = [];
    this.params = { ...DEFAULT_PARAMS, ...stage.parameters };
    // 旧Stage 1の生成順だけは再現できるようにする。通常プレイは全員同時出発。
    this.dispatchAll = dispatchAll;
    this.time = 0;
    this.removed = 0;
    this.status = 'playing';
    this.revision = 0;
    this.nextCarrier = 0;
    this.gimmicks = new GimmickState(this);
    this.pendingLinkIds = [];
    this.lastSelection = [];
  }

  exposed(dot) {
    return isExposed(this.dots, this.stage.width, this.stage.height, dot);
  }

  addBox() {
    // 将来のお助けアイテムから呼べる入口。進行中の予約と経路は保持する。
    if (this.status !== 'playing' || this.boxes.length >= 8) return false;
    this.boxes.push(null);
    this.routeFields = [];
    this.revision++;
    return true;
  }

  routeField(boxIndex) {
    const cached = this.routeFields[boxIndex];
    if (cached?.removed === this.removed) return cached.field;
    const field = buildRouteField(this.dots, this.stage.width, this.stage.height, boxPosition(boxIndex, this.boxes.length), this.geometry);
    this.routeFields[boxIndex] = { removed: this.removed, field };
    return field;
  }

  nearest(color, boxIndex) {
    const origin = boxPosition(boxIndex, this.boxes.length);
    const field = this.routeField(boxIndex);
    let nearest = null;
    let best = Infinity;
    for (const dot of this.dots) {
      if (!dot.alive || dot.reserved || dot.color !== color || !this.exposed(dot)) continue;
      if (!this.gimmicks.allows(dot, this.boxes[boxIndex])) continue;
      if (!field.reachable(dot)) continue;
      const position = dotPosition(dot, this.geometry);
      const distance = (position.x - origin.x) ** 2 + (position.y - origin.y) ** 2;
      if (distance < best) {
        nearest = dot;
        best = distance;
      }
    }
    return nearest;
  }

  linkFor(tile) {
    return tile && this.gimmicks.gates.find(gate => gate.paired && gate.keys.includes(tile.id));
  }

  // 既存の2枚連携を参照する入口も維持し、選択実体は複数IDで管理する。
  get pendingLinkId() { return this.pendingLinkIds[0] ?? null; }

  canSelect(laneIndex) {
    const tile = this.lanes[laneIndex]?.[0];
    if (this.status !== 'playing' || !tile) return false;
    if (this.pendingLinkIds.includes(tile.id)) return true;
    const required = this.linkFor(tile)?.keys.length ?? 1;
    return this.boxes.filter(box => !box).length >= required;
  }

  select(laneIndex) {
    this.lastSelection = [];
    if (!this.canSelect(laneIndex)) return false;
    const tile = this.lanes[laneIndex][0];
    const link = this.linkFor(tile);
    if (link) {
      // 組が揃うまでレーンに残し、2枚・3枚とも原子的に同時投入する。
      if (this.pendingLinkIds.includes(tile.id)) {
        this.pendingLinkIds = [];
        this.revision++;
        return true;
      }
      const pending = this.pendingLinkIds.filter(id => link.keys.includes(id) && this.lanes.some(lane => lane[0]?.id === id));
      const selectedIds = [...pending, tile.id];
      if (selectedIds.length < link.keys.length) {
        this.pendingLinkIds = selectedIds;
        this.revision++;
        return true;
      }
      const slots = this.boxes.map((box, index) => !box ? index : -1).filter(index => index >= 0);
      if (slots.length < link.keys.length) return false;
      selectedIds.map(id => this.lanes.findIndex(lane => lane[0]?.id === id)).forEach((lane, index) => {
        const selected = this.lanes[lane].shift();
        this.boxes[slots[index]] = { ...selected, remaining: selected.count, inFlight: 0, lastSpawn: -Infinity };
        this.lastSelection.push({ tile: selected, lane, slot: slots[index] });
      });
      this.pendingLinkIds = [];
      this.revision++;
      this.gimmicks.update();
      return true;
    }
    return this.selectSingle(laneIndex);
  }

  selectSingle(laneIndex) {
    if (this.status !== 'playing') return false;
    const lane = this.lanes[laneIndex];
    const slot = this.boxes.indexOf(null);
    if (!lane?.length || slot < 0) return false;
    const tile = lane.shift();
    this.boxes[slot] = { ...tile, remaining: tile.count, inFlight: 0, lastSpawn: -Infinity };
    this.lastSelection = [{ tile, lane: laneIndex, slot }];
    this.revision++;
    this.gimmicks.update();
    return true;
  }

  tick(delta) {
    if (this.status !== 'playing' || !Number.isFinite(delta) || delta < 0) return;
    this.time += delta;
    // 到着を先に処理する。新しい空きマスは同じ更新内の射出に反映される。
    const travelling = [];
    for (const carrier of this.carriers) {
      if (this.time < carrier.end) {
        travelling.push(carrier);
        continue;
      }
      const dot = this.dots[carrier.dotId];
      dot.alive = false;
      dot.reserved = false;
      const box = this.boxes[carrier.boxIndex];
      box.remaining--;
      box.inFlight--;
      this.removed++;
      this.events.push({ ...dotPosition(dot, this.geometry), color: dot.color, time: this.time });
      if (box.remaining === 0) this.boxes[carrier.boxIndex] = null;
      this.revision++;
    }
    this.carriers = travelling;
    this.gimmicks.update();
    for (let index = 0; index < this.boxes.length; index++) {
      const box = this.boxes[index];
      if (!box || box.remaining <= box.inFlight) continue;
      if (!this.dispatchAll && (box.inFlight >= this.params.maxCarriers
        || this.time - box.lastSpawn + 1e-9 < this.params.interval)) continue;
      // 今到達できる未予約ドットへ、残り個数の範囲で全員を同時に出す。
      while (box.remaining > box.inFlight) {
        const dot = this.nearest(box.color, index);
        if (!dot) break;
        const origin = boxPosition(index, this.boxes.length);
        const target = dotPosition(dot, this.geometry);
        const route = this.routeField(index).routeTo(dot);
        const duration = Math.max(this.params.minTravel, Math.min(this.params.maxTravel, route.length / this.params.speed));
        dot.reserved = true;
        box.inFlight++;
        box.lastSpawn = this.time;
        this.carriers.push({ id: this.nextCarrier++, boxIndex: index, dotId: dot.id,
          color: dot.color, origin, target, route, start: this.time, end: this.time + duration });
        if (!this.dispatchAll) break;
      }
    }
    this.events = this.events.filter(event => this.time - event.time < 0.4);
    this.resolve();
  }

  resolve() {
    if (this.removed === this.total && this.boxes.every(box => !box)
      && this.carriers.length === 0 && this.lanes.every(lane => lane.length === 0)) {
      this.status = 'won';
      this.revision++;
      return;
    }
    // 射出のクールダウンや移動中は失敗にしない。将来射出可能かで判断する。
    if (this.carriers.length || this.boxes.some((box, index) => box && this.nearest(box.color, index))) return;
    const free = this.boxes.filter(box => !box).length;
    const canSelect = this.lanes.some(lane => lane.length && free >= (this.linkFor(lane[0])?.keys.length ?? 1));
    if (!canSelect && this.removed < this.total) {
      this.status = 'lost';
      this.revision++;
    }
  }

  stats() {
    const colors = Array(this.palette?.length ?? 8).fill(0);
    let exposed = 0;
    for (const dot of this.dots) {
      if (!dot.alive) continue;
      colors[dot.color]++;
      if (!dot.reserved && this.exposed(dot)) exposed++;
    }
    return { colors, exposed, remaining: this.total - this.removed, carriers: this.carriers.length };
  }
}
