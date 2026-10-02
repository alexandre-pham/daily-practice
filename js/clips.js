// Recordings (MIDI and audio blobs) live only on this device, in IndexedDB.
let dbPromise = null;

function db() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!window.indexedDB) return reject(new Error("IndexedDB unavailable"));
    const req = indexedDB.open("suivi-audio", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("clips");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function op(mode, fn) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const tx = d.transaction("clips", mode);
    const req = fn(tx.objectStore("clips"));
    tx.oncomplete = () => resolve(req && req.result);
    tx.onerror = () => reject(tx.error);
  });
}

export const putClip = (id, blob) => op("readwrite", (s) => s.put(blob, id));
export const getClip = (id) => op("readonly", (s) => s.get(id));
export const deleteClip = (id) => op("readwrite", (s) => s.delete(id)).catch(() => {});

export function extOf(mime) {
  if (mime === "audio/midi") return "mid";
  if (/mp4|aac|m4a/.test(mime || "")) return "m4a";
  if (/ogg/.test(mime || "")) return "ogg";
  if (/wav/.test(mime || "")) return "wav";
  return "webm";
}
