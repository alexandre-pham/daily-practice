// Passphrase-based encryption (PBKDF2-SHA256 + AES-256-GCM) for the token and the gist content.
export const KDF_ITER = 600000;

const enc = new TextEncoder(),
  dec = new TextDecoder();

function b64(buf) {
  const u = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); // chunked: large gists overflow the stack
  return btoa(s);
}
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export const newSalt = () => b64(crypto.getRandomValues(new Uint8Array(16)));

/** Derive a non-extractable AES key from a passphrase and a base64 salt. */
export async function deriveKey(passphrase, salt, iter = KDF_ITER) {
  const base = await crypto.subtle.importKey("raw", enc.encode(passphrase), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt: unb64(salt), iterations: iter },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

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
