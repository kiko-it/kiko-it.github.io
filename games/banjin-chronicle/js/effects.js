/* 戦闘イベントをSVGの軌跡・斬撃・魔法光へ変換する表示専用モジュール。 */
(function (root) {
  'use strict';
  const ns = 'http://www.w3.org/2000/svg';
  const attackMs = 600, defeatMs = 600;
  const timers = new Set();
  function later(callback, ms) {
    const timer = setTimeout(() => { timers.delete(timer); callback(); }, ms);
    timers.add(timer);
  }
  function clear(board) {
    for (const timer of timers) clearTimeout(timer);
    timers.clear();
    board.querySelectorAll('.attack-layer,.defeat-ghost').forEach(node => node.remove());
  }
  function element(name, attrs) {
    const node = document.createElementNS(ns, name);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
    return node;
  }
  function render(board, events, units) {
    const attacks = events.filter(e => e.kind === 'damage' && e.from && e.to);
    if (!attacks.length) return 0;
    board.querySelector('.attack-layer')?.remove();
    const layer = element('svg', { class: 'attack-layer', viewBox: '0 0 900 900', 'aria-hidden': 'true' });
    const attributes = ['physical','magic'].filter(attr=>attacks.some(a=>(a.attr==='magic'?'magic':'physical')===attr));
    const duration = attributes.length * attackMs;
    const phases = new Map(attributes.map((attr,index)=>{
      const phase = element('g',{class:`attack-phase ${attr}`,style:`--phase-delay:${index*attackMs}ms`});
      layer.append(phase);
      return [attr,phase];
    }));
    const targetHits = new Map();
    for (const attack of attacks) {
      const key = `${attack.attr==='magic'?'magic':'physical'}:${attack.id}`;
      targetHits.set(key, [...(targetHits.get(key) || []), attack]);
    }
    for (const attack of attacks) {
      const x1 = attack.from.x * 100 + 50, y1 = attack.from.y * 100 + 50;
      // ターン内に前進した生存駒へ合わせる。撃破した駒は記録座標を使う。
      const target = units.find(u => u.id === attack.id) || attack.to;
      const x2 = target.x * 100 + 50, y2 = target.y * 100 + 50;
      const group = element('g', { class: `attack-effect ${attack.attr === 'magic' ? 'magic' : 'physical'}` });
      group.append(element('line', { class: 'attack-trail', x1, y1, x2, y2, pathLength: 100 }));
      if (attack.attr === 'magic') {
        group.append(element('circle', { class: 'magic-ring', cx: x2, cy: y2, r: 33 }));
        group.append(element('path', { class: 'magic-star', d: `M ${x2} ${y2 - 39} L ${x2 + 11} ${y2 - 11} L ${x2 + 39} ${y2} L ${x2 + 11} ${y2 + 11} L ${x2} ${y2 + 39} L ${x2 - 11} ${y2 + 11} L ${x2 - 39} ${y2} L ${x2 - 11} ${y2 - 11} Z` }));
      } else {
        group.append(element('path', { class: 'attack-slash', d: `M ${x2 - 31} ${y2 + 31} L ${x2 + 31} ${y2 - 31} M ${x2 - 22} ${y2 - 26} L ${x2 + 22} ${y2 + 26}` }));
      }
      const attr = attack.attr==='magic'?'magic':'physical';
      phases.get(attr).append(group);
      if (attack.defeated) {
        const ghost = document.createElement('span');
        ghost.className = `defeat-ghost ${attack.defeated.team}`;
        ghost.setAttribute('aria-hidden', 'true');
        ghost.style.left = `${attack.to.x / 9 * 100}%`;
        ghost.style.top = `${attack.to.y / 9 * 100}%`;
        ghost.style.setProperty('--defeat-delay', `${(attributes.indexOf(attr)+1)*attackMs}ms`);
        const piece = document.createElement('span');
        piece.className = `piece ${attack.defeated.team}`;
        const glyph = document.createElement('span'); glyph.className = 'piece-glyph';
        glyph.textContent = attack.defeated.glyph; piece.append(glyph); ghost.append(piece);
        for (let i = 0; i < 8; i++) {
          const particle = document.createElement('i'); particle.className = 'defeat-particle';
          const angle = i * Math.PI / 4;
          particle.style.setProperty('--dx', `${Math.cos(angle) * 35}px`);
          particle.style.setProperty('--dy', `${Math.sin(angle) * 35}px`);
          ghost.append(particle);
        }
        board.append(ghost);
        later(() => ghost.remove(), (attributes.indexOf(attr)+1)*attackMs + defeatMs);
      }
    }
    // 同じ対象への複数攻撃を同じ座標に重ねず、全命中をまとめて読めるようにする。
    for (const hits of targetHits.values()) {
      const id = hits[0].id;
      const numbers = element('g', { class: 'attack-numbers' });
      const target = units.find(u => u.id === id) || hits[0].to;
      const x = target.x * 100 + 50, y = target.y * 100 + 50;
      const text = element('text', { class: 'attack-number', x, y: Math.max(22, y - 28), 'text-anchor': 'middle', 'data-target': id });
      text.textContent = hits.length === 1 ? hits[0].text : `−${hits.reduce((sum, hit) => sum + Number(hit.text.replace('−', '')), 0)}`;
      numbers.append(text);
      if (hits.length > 1) {
        const breakdown = element('text', { class: 'attack-breakdown', x, y: Math.max(22, y - 28) + 21, 'text-anchor': 'middle', 'data-target': id });
        breakdown.textContent = hits.map(hit => hit.text.replace('−', '')).join('+');
        numbers.append(breakdown);
      }
      phases.get(hits[0].attr==='magic'?'magic':'physical').append(numbers);
    }
    board.append(layer);
    // DOMに演出を残さず、次のターンと再挑戦でも一度だけ再生する。
    later(() => layer.remove(), duration);
    return Math.max(duration,...attacks.filter(e=>e.defeated).map(e=>(attributes.indexOf(e.attr==='magic'?'magic':'physical')+1)*attackMs+defeatMs));
  }
  root.BanjinEffects = { render, clear };
})(window);
