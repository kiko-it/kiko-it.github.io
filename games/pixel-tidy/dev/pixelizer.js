import { quantize, fitRectangle, artDocument, MAX_GRID_SIZE } from './quantize.js';

const $ = id => document.getElementById(id);
let image = null;
let imageUrl = null;
let sourceFile = '';
let result = null;
let loadId = 0;
const number = value => value.toLocaleString('ja-JP');

function updatePixelCount() {
  const dimensions = [Number($('grid-width').value), Number($('grid-height').value)];
  const valid = dimensions.every(value => Number.isInteger(value) && value >= 10 && value <= MAX_GRID_SIZE);
  // 元画像がなくても設定の総数を確認でき、透明マスを除いた数とは区別する。
  $('pixel-count').textContent = valid
    ? `設定のピクセル数：${number(dimensions[0] * dimensions[1])}`
    : `幅・高さを10〜${MAX_GRID_SIZE}の整数にしてください`;
}

function status(message, error = false) {
  $('status').textContent = message;
  $('status').classList.toggle('error', error);
}

function exportsEnabled(enabled) {
  $('save-png').disabled = !enabled;
  $('save-json').disabled = !enabled;
}

function drawResult(canvas, data, scale = 1) {
  canvas.width = data.width * scale;
  canvas.height = data.height * scale;
  const context = canvas.getContext('2d');
  context.clearRect(0, 0, canvas.width, canvas.height);
  data.pixels.forEach((index, pixel) => {
    if (index === null) return;
    context.fillStyle = data.palette[index].hex;
    context.fillRect((pixel % data.width) * scale, Math.floor(pixel / data.width) * scale, scale, scale);
  });
}

function convert() {
  if (!image) return;
  exportsEnabled(false);
  try {
    const width = Number($('grid-width').value);
    const height = Number($('grid-height').value);
    if (![width, height].every(value => Number.isInteger(value) && value >= 10 && value <= MAX_GRID_SIZE)) throw new Error(`幅・高さは10〜${MAX_GRID_SIZE}の整数を指定してください`);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    const preserveTransparency = $('preserve-transparency').checked;
    const backgroundHex = $('background-color').value;
    if (!preserveTransparency) {
      context.fillStyle = backgroundHex;
      context.fillRect(0, 0, width, height);
    }
    const rectangle = fitRectangle(image.naturalWidth, image.naturalHeight, width, height, $('fit-mode').value);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(image, rectangle.sx, rectangle.sy, rectangle.sw, rectangle.sh,
      rectangle.dx, rectangle.dy, rectangle.dw, rectangle.dh);
    const rgba = context.getImageData(0, 0, width, height).data;
    const background = [1, 3, 5].map(offset => parseInt(backgroundHex.slice(offset, offset + 2), 16));
    result = quantize(rgba, width, height, Number($('color-limit').value), { preserveTransparency, background });
    drawResult($('pixel-preview'), result);
    $('pixel-preview').hidden = false;
    $('pixel-empty').hidden = true;
    const totalPixels = width * height;
    $('result-info').textContent = `${width} × ${height} / 全${number(totalPixels)}ピクセル / 有効${number(result.dotCount)}ドット / 透明${number(totalPixels - result.dotCount)}マス / ${result.palette.length}色`;
    $('palette-list').replaceChildren(...result.palette.map((color, index) => {
      const entry = document.createElement('div');
      entry.className = 'color-item';
      const swatch = document.createElement('span');
      swatch.className = 'swatch';
      swatch.style.background = color.hex;
      const label = document.createElement('span');
      label.textContent = `${color.name} · ${color.hex} · ${result.counts[index]}個`;
      entry.append(swatch, label);
      return entry;
    }));
    exportsEnabled(true);
    status(`変換しました。最大${$('color-limit').value}色に対して、実際は${result.palette.length}色です。`);
  } catch (error) {
    result = null;
    status(error.message || '変換に失敗しました', true);
  }
}

$('image-file').addEventListener('change', async event => {
  const file = event.target.files[0];
  if (!file) return;
  const request = ++loadId;
  exportsEnabled(false);
  $('convert').disabled = true;
  result = null;
  image = null;
  sourceFile = '';
  $('original').hidden = true;
  $('original-empty').hidden = false;
  $('pixel-preview').hidden = true;
  $('pixel-empty').hidden = false;
  $('original-info').textContent = '画像を読み込み中です。';
  $('result-info').textContent = '変換結果がここに表示されます。';
  $('palette-list').replaceChildren();
  let url = null;
  try {
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new Error('PNG・JPEG・WebP画像を選んでください');
    if (file.size > 20 * 1024 * 1024) throw new Error('画像サイズは20MB以下にしてください');
    status('画像を読み込んでいます…');
    url = URL.createObjectURL(file);
    const candidate = new Image();
    await new Promise((resolve, reject) => {
      candidate.onload = resolve;
      candidate.onerror = () => reject(new Error('画像を読み込めませんでした'));
      candidate.src = url;
    });
    if (request !== loadId) { URL.revokeObjectURL(url); return; }
    if (candidate.naturalWidth * candidate.naturalHeight > 40_000_000) throw new Error('原画像は4000万画素以下にしてください');
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    imageUrl = url;
    image = candidate;
    sourceFile = file.name;
    $('original').src = url;
    $('original').hidden = false;
    $('original-empty').hidden = true;
    $('original-info').textContent = `${file.name} / ${candidate.naturalWidth} × ${candidate.naturalHeight}`;
    if (!$('art-title').value) $('art-title').value = file.name.replace(/\.[^.]+$/, '');
    $('convert').disabled = false;
    convert();
  } catch (error) {
    if (url) URL.revokeObjectURL(url);
    if (request === loadId) status(error.message || '読み込みに失敗しました', true);
  }
});

$('convert').addEventListener('click', convert);
for (const id of ['grid-width', 'grid-height']) $(id).addEventListener('input', updatePixelCount);
updatePixelCount();
for (const id of ['grid-width', 'grid-height', 'color-limit', 'fit-mode', 'background-color', 'preserve-transparency']) {
  $(id).addEventListener('change', () => {
    if (image) convert();
  });
}

function stem() {
  return (sourceFile.replace(/\.[^.]+$/, '').replace(/[^\p{L}\p{N}_-]/gu, '-').slice(0, 80) || 'artwork')
    + `-${result.width}x${result.height}-${result.palette.length}colors`;
}

function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  // ブラウザがダウンロードを開始するまでオブジェクトURLを保持する。
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

$('save-png').addEventListener('click', () => {
  if (!result) return;
  const canvas = document.createElement('canvas');
  drawResult(canvas, result, 16);
  const filename = stem() + '.png';
  canvas.toBlob(blob => {
    if (blob) download(blob, filename);
    else status('PNGの保存に失敗しました', true);
  }, 'image/png');
});

$('save-json').addEventListener('click', () => {
  if (!result) return;
  const source = { fileName: sourceFile, title: $('art-title').value.trim(), artist: $('art-artist').value.trim(),
    url: $('source-url').value.trim(), license: $('license').value, licenseUrl: $('license-url').value.trim() };
  const document = artDocument(result, source);
  download(new Blob([JSON.stringify(document, null, 2) + '\n'], { type: 'application/json;charset=utf-8' }), stem() + '.json');
});
