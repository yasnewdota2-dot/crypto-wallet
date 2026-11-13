// Checks address derivation against published vectors for the standard BIP39 test phrase.
import { deriveAddresses, createPhrase, isValidPhrase, normalizePhrase } from '../client/src/lib/wallet.js';

const phrase = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const expected = {
  evm: '0x9858EfFD232B4033E47d90003D41EC34EcaEda94',
  bitcoin: 'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu',
  solana: 'HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk',
  tron: 'TUEZSdKsoDHQMeZwihtdoBiN46zxhGWYdH',
  dogecoin: 'DBus3bamQjgJULBJtYXpEzDWQRwF5iwxgC',
  ripple: 'rHsMGQEkVNJmpGWs8XUBoTBiAAbwxZN5v3',
  cosmos: 'cosmos19rl4cm2hmr8afy4kldpxz3fka4jguq0auqdal4',
};
const got = deriveAddresses(phrase);
let bad = 0;
for (const [k, v] of Object.entries(got)) {
  const exp = expected[k];
  const status = !exp ? 'no vector' : exp === v ? 'ok' : 'MISMATCH';
  if (status === 'MISMATCH') bad++;
  console.log(k.padEnd(9), status.padEnd(9), v, status === 'MISMATCH' ? `(expected ${exp})` : '');
}
const fresh = createPhrase();
console.log('fresh phrase valid:', isValidPhrase(fresh), '| words:', fresh.split(' ').length, '| 24:', createPhrase(24).split(' ').length);
console.log('normalize:', isValidPhrase(normalizePhrase('  Abandon abandon abandon abandon abandon abandon\nabandon abandon abandon abandon abandon ABOUT ')));
process.exit(bad ? 1 : 0);
