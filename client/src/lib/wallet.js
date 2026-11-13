// Seed phrase and address derivation. Everything here runs on the user's device;
// nothing in this file talks to the network.
import { Mnemonic, HDNodeWallet, randomBytes, sha256, ripemd160, getBytes, concat } from 'ethers';
import { bech32, base58, base58xrp } from '@scure/base';
import { sha512 } from '@noble/hashes/sha512';
import { hmac } from '@noble/hashes/hmac';
import { ed25519 } from '@noble/curves/ed25519';

export function createPhrase(words = 12) {
  return Mnemonic.fromEntropy(randomBytes(words === 24 ? 32 : 16)).phrase;
}

export function normalizePhrase(input) {
  return input.toLowerCase().normalize('NFKD').replace(/[^a-z\s]/g, ' ').trim().split(/\s+/).join(' ');
}

export function isValidPhrase(phrase) {
  const n = phrase.split(' ').length;
  return [12, 15, 18, 21, 24].includes(n) && Mnemonic.isValidMnemonic(phrase);
}

const hash160 = (pubHex) => getBytes(ripemd160(sha256(pubHex)));
const checksum = (bytes) => getBytes(sha256(sha256(bytes))).slice(0, 4);
const b58check = (bytes, codec = base58) => codec.encode(getBytes(concat([bytes, checksum(bytes)])));
const segwit = (hrp, h160) => bech32.encode(hrp, [0, ...bech32.toWords(h160)]);

// SLIP-0010 hardened-only derivation for ed25519 (Solana).
function slip10(seed, indexes) {
  let I = hmac(sha512, new TextEncoder().encode('ed25519 seed'), seed);
  for (const i of indexes) {
    const data = new Uint8Array(37);
    data.set(I.slice(0, 32), 1);
    new DataView(data.buffer).setUint32(33, (i | 0x80000000) >>> 0);
    I = hmac(sha512, I.slice(32), data);
  }
  return I.slice(0, 32);
}

/** One phrase in, one address per network family out. */
export function deriveAddresses(phrase) {
  const mnemonic = Mnemonic.fromPhrase(phrase);
  const root = HDNodeWallet.fromSeed(mnemonic.computeSeed());
  const node = (path) => root.derivePath(path);

  const tronNode = node("m/44'/195'/0'/0/0");
  const solKey = slip10(getBytes(mnemonic.computeSeed()), [44, 501, 0, 0]);

  return {
    evm: node("m/44'/60'/0'/0/0").address,
    bitcoin: segwit('bc', hash160(node("m/84'/0'/0'/0/0").publicKey)),
    litecoin: segwit('ltc', hash160(node("m/84'/2'/0'/0/0").publicKey)),
    dogecoin: b58check(getBytes(concat(['0x1e', hash160(node("m/44'/3'/0'/0/0").publicKey)]))),
    solana: base58.encode(ed25519.getPublicKey(solKey)),
    tron: b58check(getBytes(concat(['0x41', tronNode.address]))),
    ripple: b58check(getBytes(concat(['0x00', hash160(node("m/44'/144'/0'/0/0").publicKey)])), base58xrp),
    cosmos: bech32.encode('cosmos', bech32.toWords(hash160(node("m/44'/118'/0'/0/0").publicKey))),
  };
}

/** The signer used for EVM networks and for proving wallet ownership to the Latch API. */
export function evmSigner(phrase) {
  return HDNodeWallet.fromPhrase(phrase, undefined, "m/44'/60'/0'/0/0");
}

export const shortAddr = (a, n = 6) => (a && a.length > n * 2 + 3 ? `${a.slice(0, n)}…${a.slice(-n)}` : a || '');
