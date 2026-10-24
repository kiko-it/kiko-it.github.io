export const MAX_GRID_SIZE = 128;

// 頻出色の重みを使い、名画の大きな色面を残す決定的なメディアンカット。
function range(points, channel) {
  return Math.max(...points.map(p => p.rgb[channel])) - Math.min(...points.map(p => p.rgb[channel]));
}

function describe(points) {
  const ranges = [0, 1, 2].map(channel => range(points, channel));
  const channel = ranges.indexOf(Math.max(...ranges));
  return { points, channel, score: ranges[channel] * points.reduce((sum, p) => sum + p.count, 0) };
}

const hex = rgb => '#' + rgb.map(value => value.toString(16).padStart(2, '0')).join('');

export function quantize(rgba, width, height, colorLimit, { preserveTransparency = false, background = [244, 233, 207] } = {}) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1
    || width > MAX_GRID_SIZE || height > MAX_GRID_SIZE || rgba.length !== width * height * 4) throw new Error('画像サイズが不正です');
  if (!Number.isInteger(colorLimit) || colorLimit < 4 || colorLimit > 12) throw new Error('最大色数は4〜12です');
  if (!Array.isArray(background) || background.length !== 3 || background.some(v => !Number.isInteger(v) || v < 0 || v > 255)) {
    throw new Error('背景色が不正です');
  }
  const source = [];
  const histogram = new Map();
  for (let pixel = 0; pixel < width * height; pixel++) {
    const offset = pixel * 4;
    const alpha = rgba[offset + 3] / 255;
    if (preserveTransparency && alpha < 0.5) { source.push(null); continue; }
    // 半透明は指定した背景色へ合成して、曖昧な色のドットを作らない。
    const rgb = [0, 1, 2].map(channel => Math.round(rgba[offset + channel] * alpha + background[channel] * (1 - alpha)));
    source.push(rgb);
    const key = hex(rgb);
    const entry = histogram.get(key);
    if (entry) entry.count++;
    else histogram.set(key, { rgb, count: 1, key });
  }
  if (!histogram.size) throw new Error('ドットがありません。透明保持を解除するか、別の画像を選んでください');
  const boxes = [describe([...histogram.values()])];
  while (boxes.length < colorLimit) {
    let choice = -1;
    for (let index = 0; index < boxes.length; index++) {
      if (boxes[index].points.length < 2) continue;
      if (choice < 0 || boxes[index].score > boxes[choice].score) choice = index;
    }
    if (choice < 0) break;
    const box = boxes[choice];
    const points = [...box.points].sort((a, b) => a.rgb[box.channel] - b.rgb[box.channel] || a.key.localeCompare(b.key));
    const half = points.reduce((sum, p) => sum + p.count, 0) / 2;
    let accumulated = 0;
    let split = 1;
    for (let index = 0; index < points.length - 1; index++) {
      accumulated += points[index].count;
      split = index + 1;
      if (accumulated >= half) break;
    }
    boxes.splice(choice, 1, describe(points.slice(0, split)), describe(points.slice(split)));
  }
  const representatives = boxes.map(box => {
    const weight = box.points.reduce((sum, p) => sum + p.count, 0);
    return [0, 1, 2].map(channel => Math.round(box.points.reduce((sum, p) => sum + p.rgb[channel] * p.count, 0) / weight));
  });
  const unique = [...new Map(representatives.map(rgb => [hex(rgb), rgb])).values()]
    .sort((a, b) => a.reduce((sum, v) => sum + v, 0) - b.reduce((sum, v) => sum + v, 0) || hex(a).localeCompare(hex(b)));
  const pixels = source.map(rgb => {
    if (!rgb) return null;
    let best = 0;
    let distance = Infinity;
    unique.forEach((color, index) => {
      const next = color.reduce((sum, value, channel) => sum + (value - rgb[channel]) ** 2, 0);
      if (next < distance) { best = index; distance = next; }
    });
    return best;
  });
  // 空になった色は除き、素材の色IDを連番にする。
  const used = unique.map((_, index) => index).filter(index => pixels.includes(index));
  const remap = new Map(used.map((index, next) => [index, next]));
  const palette = used.map((index, next) => {
    const rgb = unique[index];
    const lightness = rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
    return { name: `色${next + 1}`, hex: hex(rgb), ink: lightness > 145 ? '#243b33' : '#ffffff' };
  });
  const mapped = pixels.map(index => index === null ? null : remap.get(index));
  const counts = palette.map((_, index) => mapped.filter(color => color === index).length);
  return { width, height, palette, pixels: mapped, counts, dotCount: counts.reduce((sum, count) => sum + count, 0) };
}

export function fitRectangle(sourceWidth, sourceHeight, width, height, mode) {
  if (![sourceWidth, sourceHeight, width, height].every(v => Number.isFinite(v) && v > 0)) throw new Error('サイズが不正です');
  if (!['contain', 'cover', 'stretch'].includes(mode)) throw new Error('配置方式が不正です');
  if (mode === 'stretch') return { sx: 0, sy: 0, sw: sourceWidth, sh: sourceHeight, dx: 0, dy: 0, dw: width, dh: height };
  if (mode === 'contain') {
    const scale = Math.min(width / sourceWidth, height / sourceHeight);
    return { sx: 0, sy: 0, sw: sourceWidth, sh: sourceHeight, dx: (width - sourceWidth * scale) / 2,
      dy: (height - sourceHeight * scale) / 2, dw: sourceWidth * scale, dh: sourceHeight * scale };
  }
  const scale = Math.max(width / sourceWidth, height / sourceHeight);
  return { sx: (sourceWidth - width / scale) / 2, sy: (sourceHeight - height / scale) / 2,
    sw: width / scale, sh: height / scale, dx: 0, dy: 0, dw: width, dh: height };
}

export function artDocument(result, source = {}) {
  // ゲームの問題データとは区別し、絵素材と出典だけを書き出す。
  return {
    format: 'pixel-tidy-art', version: 1, width: result.width, height: result.height,
    dotCount: result.dotCount, palette: result.palette,
    pixels: Array.from({ length: result.height }, (_, y) => result.pixels.slice(y * result.width, (y + 1) * result.width)),
    colorCounts: result.counts, source: { ...source },
  };
}
