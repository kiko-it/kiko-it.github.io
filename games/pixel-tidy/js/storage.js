const KEY = 'pixel-tidy-progress-v1';

export class Progress {
  constructor(storage) {
    this.storage = storage;
    this.available = Boolean(storage);
    this.completed = [];
    this.unlocked = 1;
    this.bestTimes = {};
    try {
      const data = JSON.parse(storage?.getItem(KEY) || 'null');
      // 外部編集や古い保存形式を受け取っても、正しい整数だけ取り込む。
      if (Array.isArray(data?.completed)) {
        this.completed = [...new Set(data.completed.filter(id => Number.isInteger(id) && id >= 1 && id <= 100))];
      }
      // 途中のクリア情報が欠けた場合、連続クリアした分だけ解放する。
      while (this.unlocked < 100 && this.completed.includes(this.unlocked)) this.unlocked++;
      // 過去の進行データには記録がなくても、そのまま解放状態を維持する。
      for (const [id, value] of Object.entries(data?.bestTimes ?? {})) {
        if (this.completed.includes(Number(id)) && Number.isInteger(value) && value > 0 && value <= 86400000) {
          const stageId = Number(id);
          this.bestTimes[stageId] = Math.min(this.bestTimes[stageId] ?? Infinity, value);
        }
      }
    } catch {
      this.available = false;
    }
  }

  complete(id, seconds = null) {
    if (!Number.isInteger(id) || id < 1 || id > this.unlocked || id > 100) return;
    if (!this.completed.includes(id)) this.completed.push(id);
    while (this.unlocked < 100 && this.completed.includes(this.unlocked)) this.unlocked++;
    if (Number.isFinite(seconds) && seconds > 0 && seconds <= 86400) {
      const milliseconds = Math.max(1, Math.round(seconds * 1000));
      this.bestTimes[id] = Math.min(this.bestTimes[id] ?? Infinity, milliseconds);
    }
    try {
      this.storage?.setItem(KEY, JSON.stringify({ completed: this.completed, bestTimes: this.bestTimes }));
    } catch {
      this.available = false;
    }
  }

  bestTime(id) { return this.bestTimes[id] ? this.bestTimes[id] / 1000 : null; }
  get recordCount() { return Object.keys(this.bestTimes).length; }
  get totalBestSeconds() { return Object.values(this.bestTimes).reduce((sum, value) => sum + value, 0) / 1000; }
}
