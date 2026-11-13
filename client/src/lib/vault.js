// The encrypted vault: the backup phrase is sealed with the user's password
// (PBKDF2-SHA256 -> AES-256-GCM) and kept in this browser's localStorage only.
const KEY = 'latch.vault.v1';
const ITERATIONS = 600_000;
const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function deriveKey(password, salt, iterations) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

export function readVault() {
  try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; }
}
export const hasVault = () => !!readVault();

export async function saveVault(phrase, password, meta) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt, ITERATIONS);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(phrase));
  localStorage.setItem(KEY, JSON.stringify({ salt: b64(salt), iv: b64(iv), ct: b64(ct), iterations: ITERATIONS, ...meta }));
}

/** Resolves to the phrase, or throws if the password is wrong. */
export async function openVault(password) {
  const v = readVault();
  if (!v) throw new Error('No wallet on this device.');
  const key = await deriveKey(password, unb64(v.salt), v.iterations);
  try {
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(v.iv) }, key, unb64(v.ct));
    return new TextDecoder().decode(pt);
  } catch {
    throw new Error('Wrong password.');
  }
}

export const removeVault = () => localStorage.removeItem(KEY);
