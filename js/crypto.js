// Passphrase-based encryption (PBKDF2-SHA256 + AES-256-GCM) for the token and the gist content.
export const KDF_ITER = 600000;

const enc = new TextEncoder(),
  dec = new TextDecoder();

export function b64(buf) {
  const u = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); // chunked: large gists overflow the stack
  return btoa(s);
}
export const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export const newSalt = () => b64(crypto.getRandomValues(new Uint8Array(16)));

/** Raw 256-bit key from a passphrase and a base64 salt (kept so the tab can stay unlocked across reloads). */
export async function deriveRaw(passphrase, salt, iter = KDF_ITER) {
  const base = await crypto.subtle.importKey("raw", enc.encode(passphrase), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: unb64(salt), iterations: iter }, base, 256);
  return new Uint8Array(bits);
}

export const importKey = (raw) => crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);

export async function encrypt(key, text) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(text));
  return { iv: b64(iv), ct: b64(ct) };
}

/** Throws when the key is wrong or the data was tampered with. */
export async function decrypt(key, box) {
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(box.iv) }, key, unb64(box.ct));
  return dec.decode(pt);
}
