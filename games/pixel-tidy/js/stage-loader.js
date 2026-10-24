import { readCatalog, readStage } from './stage-data.js';

// 試作は専用カタログを使い、通常版のステージ・保存済み記録を維持する。
const query = new URLSearchParams(globalThis.location?.search ?? '');
const trial = query.get('debug') === '1' && query.get('trial') === 'starry-night';
const series = query.get('series') === 'masterpieces';
const base = new URL(series ? '../stages/series/masterpieces/' : trial ? '../stages/trials/starry-night/' : '../stages/', import.meta.url);
async function json(url, fetcher) {
  const response = await fetcher(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`ステージデータの読込に失敗しました（HTTP ${response.status}）`);
  return response.json();
}

export async function loadCatalog(fetcher = fetch) {
  return readCatalog(await json(new URL('index.json', base), fetcher));
}

export async function loadStage(id, catalog, fetcher = fetch) {
  const entry = catalog.find(item => item.id === id);
  if (!entry) throw new Error(`Stage ${id} のデータは未制作です`);
  const stage = readStage(await json(new URL(entry.file, base), fetcher));
  if (stage.id !== id) throw new Error('一覧とステージ番号が一致しません');
  return stage;
}
