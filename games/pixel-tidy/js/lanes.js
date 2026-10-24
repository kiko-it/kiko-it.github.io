// 押下から解放までボタンを維持し、描画更新でクリックを失わないようにする。
export class LaneRenderer {
  constructor(container, createLane) {
    this.container = container;
    this.createLane = createLane;
    this.signatures = [];
  }

  reset() {
    // 別ステージへ切り替えるときは、同じ色IDでもパレットが異なるため作り直す。
    this.container.replaceChildren();
    this.signatures = [];
  }

  render(lanes, selectable, decorate = null) {
    lanes.forEach((tiles, index) => {
      const signature = JSON.stringify(tiles.map(({ id, color, count }) => [id, color, count]));
      if (this.signatures[index] !== signature) {
        const view = this.createLane(tiles, index);
        const previous = this.container.children[index];
        if (previous) previous.replaceWith(view);
        else this.container.append(view);
        this.signatures[index] = signature;
      }
      // 空き箱・一時停止・自動プレイの変更では、ボタン自体を置き換えない。
      const button = this.container.children[index].querySelector('button');
      if (button) {
        button.disabled = !(typeof selectable === 'function' ? selectable(index) : selectable);
        if (decorate) decorate(button, tiles[0], index);
      }
    });
  }
}
