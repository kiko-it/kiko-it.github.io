// 序盤の色名は学びやすさのため表示し、管理画面の指定を優先する。
export function displayDefaults(stageId) {
  return { boxLabels: false, laneHint: false, colorNames: stageId <= 10, laneCounts: false };
}

export class DisplaySettings {
  constructor(root, controls, boxLabels, laneHint, onChange) {
    this.root = root;
    this.controls = controls;
    this.boxLabels = boxLabels;
    this.laneHint = laneHint;
    this.overrides = {};
    this.stageId = 1;
    for (const [key, input] of Object.entries(controls)) input.addEventListener('change', () => {
      this.overrides[key] = input.checked;
      this.apply(this.stageId);
      onChange();
    });
  }

  apply(stageId, initialOverrides = {}) {
    this.stageId = stageId;
    // 最初のステージで初期値を決め、ステージ切替では表示設定を変更しない。
    this.initialDefaults ??= { ...displayDefaults(stageId), ...initialOverrides };
    const values = { ...this.initialDefaults, ...this.overrides };
    for (const [key, input] of Object.entries(this.controls)) input.checked = values[key];
    this.boxLabels.hidden = !values.boxLabels;
    this.laneHint.hidden = !values.laneHint;
    // 名前の表示はCSSで切り替え、押下中のタイルを作り直さない。
    this.root.classList.toggle('hide-color-names', !values.colorNames);
    this.root.classList.toggle('hide-lane-counts', !values.laneCounts);
  }
}
