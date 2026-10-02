// Deletions are applied immediately and can be undone for a few seconds.
// Recordings attached to deleted sessions are only erased once the undo window has passed.
import { state, changed, ensureActivity } from "./store.js";
import { deleteClip } from "./clips.js";
import { emit } from "./bus.js";

const UNDO_MS = 7000;
let pending = null; // {before: {acts, entries}, clipIds, timer}

function purge(p) {
  clearTimeout(p.timer);
  p.clipIds.forEach(deleteClip);
}

/**
 * Apply a deletion.
 * @param {{acts?: string[], entries?: string[]}} keys records to tombstone
 * @returns {() => void} undo function
 */
export function removeWithUndo({ acts = [], entries = [] }) {
  if (pending) purge(pending); // only the latest deletion can be undone
  const now = Date.now(),
    before = { acts: {}, entries: {} },
    clipIds = [];
  acts.forEach((id) => {
    before.acts[id] = state.data.acts[id];
    state.data.acts[id] = { deleted: true, t: now };
  });
  entries.forEach((k) => {
    const e = state.data.entries[k];
    before.entries[k] = e;
    (e && e.clips ? e.clips : []).forEach((c) => clipIds.push(c.id));
    state.data.entries[k] = { deleted: true, t: now };
  });
  const p = { before, clipIds };
  p.timer = setTimeout(() => {
    purge(p);
    if (pending === p) pending = null;
  }, UNDO_MS);
  pending = p;
  ensureActivity();
  changed();

  return function undo() {
    if (pending !== p) return;
    clearTimeout(p.timer);
    pending = null;
    const t = Date.now(); // newer than the tombstone, so the restore wins on every device
    for (const id in p.before.acts) if (p.before.acts[id]) state.data.acts[id] = Object.assign({}, p.before.acts[id], { t });
    for (const k in p.before.entries)
      if (p.before.entries[k]) state.data.entries[k] = Object.assign({}, p.before.entries[k], { t });
    changed();
    emit("render");
  };
}

export const UNDO_DURATION = UNDO_MS;
