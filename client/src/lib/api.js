import { JsonRpcProvider, FetchRequest, Contract, parseUnits, formatUnits } from 'ethers';

let walletToken = null;
export const setWalletToken = (t) => { walletToken = t; };

export async function api(path, { method = 'GET', body, auth = false } = {}) {
  const headers = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (auth && walletToken) headers.authorization = `Bearer ${walletToken}`;
  let res;
  try {
    res = await fetch(`/api${path}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined, credentials: 'same-origin' });
  } catch {
    throw Object.assign(new Error('Can’t reach the Latch server. Check your connection and try again.'), { status: 0 });
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `Request failed (${res.status}).`), { status: res.status, data });
  return data;
}

/** Prove ownership of the wallet by signing a server nonce, and get a session. */
export async function signIn(signer, addresses, origin) {
  const address = signer.address.toLowerCase();
  const { message } = await api('/wallet/challenge', { method: 'POST', body: { address } });
  const signature = await signer.signMessage(message);
  const { token } = await api('/wallet/session', { method: 'POST', body: { address, signature, addresses, origin } });
  walletToken = token;
  return token;
}

function provider(chain) {
  const req = new FetchRequest(`${location.origin}/api/rpc/${chain.id}`);
  req.setHeader('authorization', `Bearer ${walletToken}`);
  return new JsonRpcProvider(req, chain.chainId, { staticNetwork: true });
}

const ERC20 = ['function transfer(address to, uint256 value) returns (bool)'];

/** Builds an EVM transfer and estimates its network fee. Nothing is broadcast. */
export async function prepareSend({ signer, chain, asset, to, amount }) {
  const p = provider(chain);
  const value = parseUnits(amount, asset.decimals);
  const tx = asset.contract
    ? { to: asset.contract, data: new Contract(asset.contract, ERC20).interface.encodeFunctionData('transfer', [to, value]) }
    : { to, value };
  const [estimate, fee] = await Promise.all([p.estimateGas({ ...tx, from: signer.address }), p.getFeeData()]);
  const gasLimit = estimate < 21000n ? 21000n : estimate; // some nodes under-quote plain transfers
  const perGas = fee.maxFeePerGas ?? fee.gasPrice;
  if (perGas == null) throw new Error('The network did not return a fee quote. Try again.');
  return { tx: { ...tx, gasLimit }, feeWei: gasLimit * perGas, send: async () => (await signer.connect(p).sendTransaction({ ...tx, gasLimit })).hash };
}

/** Largest native amount that still leaves room for the fee. */
export async function maxNative({ signer, chain, rawBalance }) {
  const p = provider(chain);
  const fee = await p.getFeeData();
  const perGas = fee.maxFeePerGas ?? fee.gasPrice ?? 0n;
  const left = BigInt(rawBalance) - perGas * 21000n * 12n / 10n;
  return left > 0n ? formatUnits(left, chain.decimals) : '0';
}

export const fmtUnits = formatUnits;
