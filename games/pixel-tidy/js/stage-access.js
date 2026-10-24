// デバッグの試遊権限と通常の進行保存を分ける。
export function canPlayStage(id, catalog, progress, debug) {
  return catalog.some(entry => entry.id === id) && (debug || id <= progress.unlocked);
}
export function isDebugTrial(id, progress, debug) {
  return debug && id > progress.unlocked;
}
export function saveStageCompletion(id, progress, trial, seconds = null) {
  if (!trial) progress.complete(id, seconds);
}
