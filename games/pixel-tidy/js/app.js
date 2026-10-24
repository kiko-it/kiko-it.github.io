import { loadCatalog, loadStage } from './stage-loader.js';
import { Game, DEFAULT_PARAMS } from './model.js';
import { draw } from './render.js';
import { Progress } from './storage.js';
import { LaneRenderer } from './lanes.js';
import { canPlayStage, isDebugTrial, saveStageCompletion } from './stage-access.js';
import { solutionReady, solutionMatches } from './solution-playback.js';
import { TileLinkRenderer } from './tile-links.js';
import { DisplaySettings } from './display-settings.js';
import { browserStorage } from './browser-storage.js';
import { PlayTimer, formatTime } from './play-timer.js';

const $ = id => document.getElementById(id);
const progress = new Progress(browserStorage(window, document));
let stage = null;
let catalog = [];
let catalogLoading = true;
let stageError = '';
let loadingStage = false;
let loadRequest = 0;
// JSON内の名前はテキストとして扱い、タイルのHTMLへそのまま埋め込まない。
const escapeText = value => value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
$('title-dot-count').textContent = 'ひとつの絵。ひとつの小さなパズル。';
let game = null;
let screen = 'title';
let paused = false;
let auto = false;
let debugTrial = false;
let playTimer = new PlayTimer(performance.now());
let recordEligible = false;
let solutionIndex = 0;
let lastRevision = -1;
let lastStats = -Infinity;
const masterpieceSeries = new URLSearchParams(location.search).get('series') === 'masterpieces';
let debug = masterpieceSeries || new URLSearchParams(location.search).get('debug') === '1';
const trialMode = masterpieceSeries || (debug && new URLSearchParams(location.search).get('trial') === 'starry-night');
let trialLabOpen = false;
const parameters = { ...DEFAULT_PARAMS };
const laneRenderer = new LaneRenderer($('lanes'), createLane);
const tileLinkRenderer = new TileLinkRenderer($('lane-board'), $('tile-links'));
const displaySettings = new DisplaySettings($('game-screen'), {
  boxLabels: $('show-box-labels'), laneHint: $('show-lane-hint'), colorNames: $('show-color-names'),
  laneCounts: $('show-lane-counts'),
}, $('box-labels'), $('lane-hint'), () => { if (game) tileLinkRenderer.render(game); });
if (typeof ResizeObserver === 'function') new ResizeObserver(() => {
  if (game && screen === 'game') tileLinkRenderer.render(game);
}).observe($('lane-board'));
const parameterDefinitions = [
  ['speed', '移動速度', 60, 600, 10, 'px/秒'],
  ['minTravel', '最短移動時間', 0.2, 3, 0.1, '秒'],
  ['maxTravel', '最長移動時間', 1, 6, 0.1, '秒'],
  ['timeScale', '時間倍率', 0.5, 5, 0.5, '倍'],
];

function setScreen(next) {
  playTimer.sample(performance.now(), false);
  if (next !== 'game') loadRequest++;
  screen = next;
  $('phone').classList.toggle('trial-wide', trialMode && (next === 'game' || (masterpieceSeries && next === 'menu')));
  for (const name of ['title', 'menu', 'game']) $(name + '-screen').hidden = name !== next;
  $('debug-panel').hidden = !debug || next !== 'game' || (trialMode && !trialLabOpen);
  if (next === 'menu') renderMenu();
  updateTimer();
}

function updateTimer(now = performance.now()) {
  playTimer.sample(now, screen === 'game' && game?.status === 'playing' && !paused && !loadingStage && !document.hidden);
}

function renderMenu() {
  if (masterpieceSeries) {
    document.title = '名画シリーズ — Pixel Tidy';
    $('menu-screen').classList.add('masterpiece-menu');
    document.querySelector('.menu-heading h2').textContent = '名画シリーズ';
    document.querySelector('.menu-heading > p:not(.eyebrow)').textContent = '星月夜、神奈川沖浪裏、赤富士、夜のカフェテラス。4つの名画を片付けよう。';
    document.querySelector('.menu-header > span').textContent = 'PIXEL TIDY / 名画シリーズ';
    document.querySelector('.tiny-tag').textContent = '4 WORKS';
    document.querySelector('.menu-note').textContent = 'すべての作品を自由に選べます。通常100ステージの進行・記録には保存されません。';
    $('score-summary').hidden = true;
    $('storage-notice').hidden = true;
    $('progress-summary').textContent = stageError || (catalogLoading ? '作品を読み込み中です…' : '4作品 · 12色 · 2〜3箱・4レーン · 上級');
    $('stage-grid').classList.add('masterpiece-gallery');
    $('stage-grid').setAttribute('aria-label', '名画シリーズの4作品');
    const keys = ['starry-night', 'great-wave', 'red-fuji', 'cafe-terrace'];
    const sizes = ['70×60 · 4,200ドット', '82×56 · 4,592ドット', '82×56 · 4,592ドット', '64×80 · 5,120ドット'];
    const cards = catalog.map(entry => {
      const button = document.createElement('button');
      button.className = 'masterpiece-card';
      button.setAttribute('aria-label', entry.name + 'を遊ぶ');
      const image = document.createElement('img');
      image.src = new URL(`../stages/series/masterpieces/images/${keys[entry.id - 1]}.png`, import.meta.url).href;
      image.alt = entry.name;
      const title = document.createElement('strong');
      title.textContent = entry.name;
      const detail = document.createElement('span');
      detail.textContent = `${sizes[entry.id - 1]} · ${entry.id === 3 ? 2 : 3}箱 · Lv.10`;
      const action = document.createElement('span');
      action.className = 'masterpiece-action';
      action.textContent = 'この名画を遊ぶ →';
      button.append(image, title, detail, action);
      button.addEventListener('click', () => startGame(entry.id));
      return button;
    });
    $('stage-grid').replaceChildren(...cards);
    return;
  }
  $('progress-summary').textContent = stageError || (catalogLoading ? 'ステージ一覧を読み込み中です…' : `クリア ${progress.completed.length} / 100　·　解放 ${progress.unlocked} / 100`);
  $('storage-notice').hidden = progress.available;
  $('score-summary').textContent = `${progress.recordCount === 100 ? '合計スコア' : '最速時間の暫定合計'} ${formatTime(progress.totalBestSeconds)} · 記録 ${progress.recordCount}/100`;
  if (debug && !stageError && !catalogLoading) $('progress-summary').textContent += '　· デバッグ：登録済みを試遊可能';
  const fragment = document.createDocumentFragment();
  for (let id = 1; id <= 100; id++) {
    const unlocked = id <= progress.unlocked || (debug && catalog.some(entry => entry.id === id));
    const completed = progress.completed.includes(id);
    const entry = catalog.find(item => item.id === id);
    const available = Boolean(entry);
    const button = document.createElement('button');
    button.className = 'stage-tile' + (unlocked ? ' available' : '') + (completed ? ' completed' : '');
    button.disabled = !unlocked || (debug && !available);
    if (entry) button.title = `${entry.name} / 難易度 Lv.${entry.difficultyLevel}`;
    button.setAttribute('aria-label', `Stage ${id} ${completed && available ? 'クリア済み' : unlocked ? (available ? 'プレイ可能' : '解放済み・制作予定') : '未解放'}`);
    button.innerHTML = `<strong>${String(id).padStart(2, '0')}</strong><span>${completed && available ? '✓ CLEAR' : unlocked ? (available ? `Lv.${entry.difficultyLevel}` : '制作予定') : '🔒'}</span>${progress.bestTime(id) ? `<small>${formatTime(progress.bestTime(id))}</small>` : ''}`;
    if (!available && unlocked) {
      // 解放と制作状況は分離する。未制作のステージはゲームを開始しない。
      button.addEventListener('click', () => {
        $('progress-summary').textContent = stageError || (catalogLoading ? 'ステージ一覧を読み込み中です…' : `Stage ${id} は解放済みです。ゲーム内容は制作予定です。`);
      });
    } else button.addEventListener('click', () => startGame(id));
    fragment.append(button);
  }
  $('stage-grid').replaceChildren(fragment);
}

async function startGame(id = game?.stage.id ?? 1) {
  if (!canPlayStage(id, catalog, progress, debug)) return false;
  if (loadingStage) return;
  loadingStage = true;
  updateTimer();
  const request = ++loadRequest;
  try {
    const loaded = await loadStage(id, catalog);
    // 読込中にタイトルやメニューへ移動した場合は、勝手にゲームを開かない。
    if (request !== loadRequest) return;
    stage = loaded;
    stageError = '';
  } catch (error) {
    stageError = error.message;
    $('game-message').textContent = stageError;
    if (screen === 'menu') renderMenu();
    return;
  } finally { loadingStage = false; }
  // 初回だけステージの初期値を使い、以降は管理画面の設定を引き継ぐ。
  if (!game) Object.assign(parameters, DEFAULT_PARAMS, stage.parameters);
  game = new Game(stage);
  $('board').dataset.compact = String(trialMode);
  $('game-screen').classList.toggle('expanded-board', stage.boardLayout === 'portrait');
  displaySettings.apply(stage.id, masterpieceSeries ? { colorNames: false } : undefined);
  debugTrial = trialMode || isDebugTrial(id, progress, debug);
  playTimer = new PlayTimer(performance.now());
  const standard = { ...DEFAULT_PARAMS, ...stage.parameters };
  recordEligible = !debugTrial && Object.keys(standard).every(key => parameters[key] === standard[key]);
  game.params = { ...parameters };
  syncParameters();
  paused = false;
  auto = false;
  solutionIndex = 0;
  lastRevision = -1;
  lastStats = -Infinity;
  $('result').hidden = true;
  $('pause').textContent = '一時停止';
  $('autoplay').textContent = '正解手順で自動プレイ';
  $('game-message').textContent = '';
  document.querySelector('.game-header strong').textContent = masterpieceSeries ? `名画 ${stage.id} / 4` : `STAGE ${String(stage.id).padStart(2, '0')}`;
  document.querySelector('.art-label span').textContent = stage.name;
  document.querySelector('.art-label span:last-child').textContent = `${stage.palette.length} COLORS · Lv.${stage.difficulty.level}`;
  $('board').setAttribute('aria-label', `${stage.dotCount}ドットの${stage.name}と荷運びキャラ`);
  laneRenderer.reset();
  tileLinkRenderer.reset();
  setScreen('game');
  renderGame();
  return true;
}

function makeTile(tile, laneIndex, enabled) {
  const color = stage.palette[tile.color];
  const element = document.createElement(enabled ? 'button' : 'div');
  element.className = 'tile' + (enabled ? '' : ' next-tile');
  element.style.background = color.hex;
  element.style.color = color.ink;
  element.dataset.tileId = String(tile.id);
  const gateIndex = game.gimmicks.gates.findIndex(item => item.keys.includes(tile.id));
  const gate = game.gimmicks.gates[gateIndex];
  if (enabled) {
    if (gate?.paired) element.classList.add('linked');
    element.innerHTML = `<strong>${tile.count}</strong><small class="color-name">${escapeText(color.name)}</small>`;
    element.setAttribute('aria-label', `レーン${laneIndex + 1} 先頭 ${color.name} ${tile.count}ドット${gate?.paired ? `、${gate.name}、線でつながる${gate.keys.length}枚を選ぶと${gate.keys.length}箱へ同時投入` : ''}`);
    element.disabled = !game.canSelect(laneIndex) || paused || auto;
    element.addEventListener('click', () => {
      const origins = Array.from($('lanes').children, lane => lane.querySelector('button')?.getBoundingClientRect());
      if (game.select(laneIndex)) {
        $('game-message').textContent = game.lastSelection.length > 1 ? `連携タイル${game.lastSelection.length}枚を同時投入しました。`
          : game.lastSelection.length ? `${$('show-color-names').checked ? color.name + ' ' : ''}${tile.count}個を箱へ。` : game.pendingLinkId ? '線でつながるタイルを選べます。' : '選択を解除しました。';
        renderGame();
        for (const item of game.lastSelection) if (origins[item.lane]) animateTile(item.tile, origins[item.lane], item.slot);
      }
    });
  } else {
    element.innerHTML = `<span class="color-name">${escapeText(color.name)}</span><span>${tile.count}</span>`;
    element.setAttribute('aria-hidden', 'true');
  }
  return element;
}

function animateTile(tile, origin, slot) {
  // ゲーム状態と独立した演出。端末のモーション低減設定を尊重する。
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const destination = $('boxes').children[slot].getBoundingClientRect();
  const color = stage.palette[tile.color];
  const flying = document.createElement('div');
  flying.className = 'tile flying-tile';
  flying.textContent = tile.count;
  Object.assign(flying.style, { left: `${origin.left}px`, top: `${origin.top}px`,
    width: `${origin.width}px`, height: `${origin.height}px`, background: color.hex, color: color.ink });
  flying.setAttribute('aria-hidden', 'true');
  document.body.append(flying);
  const animation = flying.animate([
    { transform: 'translate(0,0) scale(1)', opacity: 1 },
    { transform: `translate(${destination.left - origin.left}px,${destination.top - origin.top}px) scale(.8)`, opacity: 0.5 },
  ], { duration: 300, easing: 'ease-in' });
  animation.finished.then(() => flying.remove(), () => flying.remove());
}

function renderGame() {
  if (!game) return;
  $('dot-counter').textContent = `${game.total - game.removed} / ${game.total}`;
  $('play-time').textContent = formatTime(playTimer.seconds);
  const empty = game.boxes.filter(box => !box).length;
  $('box-count').textContent = `空き ${empty} / ${game.boxes.length}`;
  $('boxes').style.gridTemplateColumns = `repeat(${game.boxes.length}, minmax(0, 1fr))`;
  $('lanes').style.gridTemplateColumns = `repeat(${game.lanes.length}, minmax(0, 1fr))`;
  const boxes = game.boxes.map((box, index) => {
    const element = document.createElement('div');
    element.className = 'box ' + (box ? 'occupied' : 'empty');
    if (!box) {
      element.textContent = '+';
      element.setAttribute('aria-label', `箱${index + 1} 空き`);
    } else {
      const color = stage.palette[box.color];
      const gate = game.gimmicks.gates.find(item => item.keys.includes(box.id));
      const state = box.inFlight ? `${box.inFlight}匹 運搬中` : gate && !gate.open ? `${gate.name} 相手待ち` : '露出待ち';
      element.style.background = color.hex;
      element.style.color = color.ink;
      element.innerHTML = `<strong>${box.remaining}</strong><small class="color-name">${escapeText(color.name)}</small><span class="box-state">${state}</span>`;
      element.setAttribute('aria-label', `箱${index + 1} ${color.name} 残り${box.remaining} ${state}`);
    }
    return element;
  });
  $('boxes').replaceChildren(...boxes);
  laneRenderer.render(game.lanes, index => !paused && !auto && game.canSelect(index), (button, tile) => {
    const selected = game.pendingLinkIds.includes(tile.id);
    const partner = !selected && game.linkFor(tile)?.keys.includes(game.pendingLinkId);
    button.classList.toggle('link-selected', selected);
    button.classList.toggle('link-partner', Boolean(partner));
    button.setAttribute('aria-pressed', String(selected));
  });
  tileLinkRenderer.render(game);
  if (empty === 0 && game.status === 'playing') $('game-message').textContent = `${game.boxes.length}箱が作業中です。空くまで待ってください。`;
  lastRevision = game.revision;
  // 通常画面は印と盤面の反応で伝え、条件の詳細は管理画面へ集約する。
  $('gimmick-status').hidden = true;
  $('gimmick-status').textContent = '';
  $('game-message').classList.toggle('visually-hidden', stage.id > 10);
}

function createLane(tiles, index) {
  const lane = document.createElement('div');
  lane.className = 'lane';
  if (tiles.length) {
    lane.append(makeTile(tiles[0], index, true));
    for (const tile of tiles.slice(1, 3)) lane.append(makeTile(tile, index, false));
  } else {
    const emptyLane = document.createElement('div');
    emptyLane.className = 'lane-empty';
    emptyLane.textContent = '完了 ✓';
    lane.append(emptyLane);
  }
  const count = document.createElement('span');
  count.className = 'lane-count';
  count.textContent = `レーン ${index + 1} · 残り ${tiles.length}`;
  lane.append(count);
  return lane;
}

function showResult() {
  if (!$('result').hidden) return;
  const won = game.status === 'won';
  playTimer.sample(performance.now(), false);
  const before = progress.bestTime(stage.id);
  if (won) saveStageCompletion(stage.id, progress, debugTrial, recordEligible ? playTimer.seconds : null);
  $('result-retry').textContent = won
    ? canPlayStage(stage.id + 1, catalog, progress, debug) ? '次のステージへ' : 'ステージ選択へ'
    : 'もう一度遊ぶ';
  $('result-eyebrow').textContent = won ? 'ALL TIDY!' : 'LET’S TRY AGAIN';
  $('result-title').textContent = won ? 'すっきり、片付いた！' : '箱がいっぱい！';
  const next = masterpieceSeries ? '名画シリーズは通常ステージの進行とは別に遊べます。'
    : debugTrial ? 'デバッグ試遊のため進行には保存しません。'
    : stage.id < 100 ? `Stage ${stage.id + 1}を解放しました${catalog.some(entry => entry.id === stage.id + 1) ? '。' : '（制作予定）。'}`
      : progress.completed.length === 100 ? '全100ステージをクリアしました。' : 'Stage 100をクリアしました。';
  $('result-copy').textContent = won
    ? `${game.total}ドットのお片付け完了。${next} クリア時間 ${formatTime(playTimer.seconds)}。${recordEligible ? `${before === null || progress.bestTime(stage.id) < before ? '自己ベスト！ ' : ''}最速 ${formatTime(progress.bestTime(stage.id))}。合計 ${formatTime(progress.totalBestSeconds)}（${progress.recordCount}/100）。` : '検証プレイのため最速記録には保存しません。'}${progress.available ? '' : '進行はこの画面を開いている間だけ保存されます。'}`
    : game.gimmicks.gates.length ? '空き箱を残して、もう一度挑戦しよう。'
      : 'どの箱も運べる色がなく、先に進めません。';
  if (masterpieceSeries) {
    $('result-menu').textContent = '作品選択へ';
    if (!canPlayStage(stage.id + 1, catalog, progress, debug) && won) $('result-retry').textContent = '作品選択へ';
  }
  $('result').hidden = false;
  auto = false;
  $('autoplay').textContent = '正解手順で自動プレイ';
}

function renderStats() {
  const stats = game.stats();
  $('debug-stats').innerHTML = `残ドット <b>${stats.remaining}</b> / ${game.total}<br>露出・未予約 <b>${stats.exposed}</b><br>箱数 <b>${game.boxes.length}</b><br>移動中キャラ <b>${stats.carriers}</b>（運搬可能数に応じて同時出発）<br>ゲーム時間 ${game.time.toFixed(1)} 秒<br>状態 ${paused ? '一時停止' : game.status}`;
  const details = game.gimmicks.fog.map(item => `${item.name} ${item.open ? '開放' : item.requirements.map(({ color, removed, count }) => `${escapeText(game.palette[color].name)} ${removed}/${count}`).join('・')}`);
  $('debug-stats').innerHTML += details.length ? '<br>' + details.join('<br>') : '';
  $('add-box').disabled = game.status !== 'playing' || game.boxes.length >= 8;
  $('color-stats').replaceChildren(...stage.palette.map((color, index) => {
    const element = document.createElement('div');
    element.className = 'color-stat';
    element.innerHTML = `<span class="swatch" style="background:${color.hex}"></span>${escapeText(color.name)} ${stats.colors[index]}`;
    return element;
  }));
}

function syncParameters() {
  for (const [key, , , , step, unit] of parameterDefinitions) {
    $('param-' + key).value = parameters[key];
    $('value-' + key).textContent = `${step < 1 ? parameters[key].toFixed(2).replace(/0$/, '') : parameters[key]} ${unit}`;
  }
  if (game) game.params = { ...parameters };
}

for (const [key, label, min, max, step] of parameterDefinitions) {
  const element = document.createElement('label');
  element.className = 'parameter';
  element.innerHTML = `<span>${label}<output id="value-${key}" for="param-${key}"></output></span><input id="param-${key}" type="range" min="${min}" max="${max}" step="${step}" aria-label="${label}">`;
  $('parameter-controls').append(element);
  $('param-' + key).addEventListener('input', event => {
    recordEligible = false;
    parameters[key] = Number(event.target.value);
    // 最短と最長が逆転しないよう、対になる設定も追従させる。
    if (key === 'minTravel') parameters.maxTravel = Math.max(parameters.minTravel, parameters.maxTravel);
    if (key === 'maxTravel') parameters.minTravel = Math.min(parameters.minTravel, parameters.maxTravel);
    syncParameters();
  });
}
syncParameters();

$('title-screen').addEventListener('click', () => setScreen('menu'));
$('start').addEventListener('click', event => { event.stopPropagation(); setScreen('menu'); });
$('back-title').addEventListener('click', () => setScreen('title'));
$('back-menu').addEventListener('click', () => setScreen('menu'));
$('retry').addEventListener('click', () => startGame());
$('result-retry').addEventListener('click', () => {
  if (game?.status !== 'won') return startGame();
  if (canPlayStage(stage.id + 1, catalog, progress, debug)) return startGame(stage.id + 1);
  setScreen('menu');
});
$('result-menu').addEventListener('click', () => setScreen('menu'));
$('debug-toggle').addEventListener('click', () => {
  if (trialMode) trialLabOpen = !trialLabOpen;
  else debug = !debug;
  $('debug-panel').hidden = trialMode ? !trialLabOpen : !debug;
});
$('add-box').addEventListener('click', () => {
  if (game?.addBox()) {
    recordEligible = false;
    $('game-message').textContent = 'お片付けボックスを1箱追加しました。';
    renderGame();
    renderStats();
  }
});
$('pause').addEventListener('click', () => {
  updateTimer();
  paused = !paused;
  updateTimer();
  $('pause').textContent = paused ? '再開' : '一時停止';
  renderGame();
});
$('autoplay').addEventListener('click', async () => {
  if (game.status !== 'playing') return;
  // 手動操作後の順序が正解と違えば、新しいゲームで解法を実行する。
  if (!auto && !solutionMatches(game, solutionIndex)) {
    if (!await startGame()) return;
  }
  auto = !auto;
  recordEligible = false;
  $('autoplay').textContent = auto ? '自動プレイを停止' : '正解手順で自動プレイ';
  renderGame();
});

let lastFrame = performance.now();
function frame(now) {
  // 背景タブから戻ったときは経過を取り戻さず、現在から再開する。
  const delta = Math.min(0.05, Math.max(0, (now - lastFrame) / 1000));
  lastFrame = now;
  updateTimer(now);
  if (screen === 'game' && game) {
    if (!paused && !loadingStage && !document.hidden && game.status === 'playing') {
      const autoReady = solutionReady(game, stage.autoplay === 'parallel', stage.solution[solutionIndex]);
      if (auto && autoReady) {
        const tile = stage.solution[solutionIndex];
        if (tile && game.select(tile.lane)) solutionIndex++;
      }
      game.tick(delta * parameters.timeScale);
    }
    draw($('board'), game, $('show-targets').checked && debug);
    if (lastRevision !== game.revision || now - lastStats > 200) renderGame();
    if (now - lastStats > 200) {
      if (debug) renderStats();
      lastStats = now;
    }
    if (game.status !== 'playing') showResult();
  }
  requestAnimationFrame(frame);
}
document.addEventListener('visibilitychange', () => { lastFrame = performance.now(); updateTimer(lastFrame); });
setScreen('title');
requestAnimationFrame(frame);
try {
  catalog = await loadCatalog();
  catalogLoading = false;
  if (screen === 'menu') renderMenu();
  const directStage = Number(new URLSearchParams(location.search).get('stage'));
    if (debug && canPlayStage(directStage, catalog, progress, debug)) await startGame(directStage);
    else if (masterpieceSeries) setScreen('menu');
} catch (error) {
  catalogLoading = false;
  stageError = error.message + '。サーバーとステージ一覧を確認してください。';
  if (screen === 'menu') renderMenu();
}
