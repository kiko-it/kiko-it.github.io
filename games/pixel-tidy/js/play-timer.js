// ゲーム内の時間倍率から独立し、考えている時間も含めて実時間を測る。
export class PlayTimer {
  constructor(now = 0) {
    this.last = now;
    this.milliseconds = 0;
    this.running = false;
  }
  sample(now, running) {
    if (this.running) this.milliseconds += Math.max(0, now - this.last);
    this.last = now;
    this.running = running;
  }
  get seconds() {
    return this.milliseconds / 1000;
  }
}

export function formatTime(seconds) {
  const centiseconds = Math.floor(Math.max(0, seconds) * 100 + 0.00001);
  const minutes = Math.floor(centiseconds / 6000);
  return `${String(minutes).padStart(2, "0")}:${String(Math.floor(centiseconds / 100) % 60).padStart(2, "0")}.${String(centiseconds % 100).padStart(2, "0")}`;
}
