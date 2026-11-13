// Read-only chain lookups: balances and market prices. All calls time out and
// fail soft (null balance) so one dead upstream never breaks the wallet.

const cache = new Map();
async function cached(key, ttlMs, fn) {
  const hit = cache.get(key);
  if (hit && hit.exp > Date.now()) return hit.val;
  const val = await fn();
  cache.set(key, { val, exp: Date.now() + ttlMs });
  if (cache.size > 5000) cache.delete(cache.keys().next().value);
  return val;
}

async function getJson(url, opts = {}, timeout = 9000) {
  const res = await fetch(url, { ...opts, signal: AbortSignal.timeout(timeout), headers: { accept: 'application/json', 'content-type': 'application/json', ...(opts.headers || {}) } });
  if (!res.ok) { const e = new Error(`${res.status} from ${new URL(url).host}`); e.status = res.status; throw e; }
  return res.json();
}

export async function rpcCall(url, method, params) {
  const j = await getJson(url, { method: 'POST', body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
  if (j.error) throw new Error(j.error.message || 'RPC error');
  return j.result;
}

async function nativeBalance(chain, address) {
  const rpc = chain.rpc.replace(/\/$/, '');
  switch (chain.family) {
    case 'evm':
      return BigInt(await rpcCall(rpc, 'eth_getBalance', [address, 'latest'])).toString();
    case 'utxo': {
      if (chain.id === 'dogecoin') {
        const j = await getJson(`${rpc}/addrs/${address}/balance`);
        return String(j.balance ?? 0);
      }
      const j = await getJson(`${rpc}/address/${address}`);
      const s = j.chain_stats, m = j.mempool_stats;
      return String(s.funded_txo_sum - s.spent_txo_sum + m.funded_txo_sum - m.spent_txo_sum);
    }
    case 'solana': {
      const r = await rpcCall(rpc, 'getBalance', [address]);
      return String(r.value ?? 0);
    }
    case 'tron': {
      const j = await getJson(`${rpc}/v1/accounts/${address}`);
      return String(j.data?.[0]?.balance ?? 0);
    }
    case 'xrp': {
      const j = await getJson(rpc, { method: 'POST', body: JSON.stringify({ method: 'account_info', params: [{ account: address, ledger_index: 'validated' }] }) });
      if (j.result?.error === 'actNotFound') return '0';
      if (j.result?.error) throw new Error(j.result.error);
      return String(j.result.account_data.Balance);
    }
    case 'cosmos': {
      const j = await getJson(`${rpc}/cosmos/bank/v1beta1/balances/${address}`);
      return String(j.balances?.find((b) => b.denom === 'uatom')?.amount ?? 0);
    }
    default:
      throw new Error('Unsupported network family');
  }
}

async function tokenBalance(chain, token, address) {
  const data = '0x70a08231' + address.toLowerCase().replace(/^0x/, '').padStart(64, '0');
  const r = await rpcCall(chain.rpc, 'eth_call', [{ to: token.contract, data }, 'latest']);
  return BigInt(r === '0x' ? 0 : r).toString();
}

const soft = (key, fn) => cached(key, 20_000, fn).catch(() => null);

/** Returns [{ key, chain, symbol, name, decimals, cg, raw, address, contract? }] */
export async function fetchBalances(addresses, chains, tokens) {
  const jobs = [];
  for (const c of chains) {
    const address = addresses[c.addressKey];
    if (!address) continue;
    jobs.push(soft(`n:${c.id}:${address}`, () => nativeBalance(c, address)).then((raw) => ({
      key: c.id, chain: c.id, symbol: c.symbol, name: c.name, decimals: c.decimals, cg: c.cg, raw, address,
    })));
    for (const t of tokens.filter((t) => t.chain === c.id && c.family === 'evm')) {
      jobs.push(soft(`t:${c.id}:${t.contract}:${address}`, () => tokenBalance(c, t, address)).then((raw) => ({
        key: `${c.id}:${t.contract}`, chain: c.id, symbol: t.symbol, name: t.name, decimals: t.decimals, cg: t.cg, raw, address, contract: t.contract,
      })));
    }
  }
  return Promise.all(jobs);
}

let lastMarkets = { coins: [], updated: 0, stale: true };
let marketsRetryAt = 0;
export async function fetchMarkets() {
  if (Date.now() < marketsRetryAt) return { ...lastMarkets, stale: true };
  try {
    return await cached('markets', 90_000, async () => {
      const url = 'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=1&sparkline=true&price_change_percentage=24h,7d';
      const rows = await getJson(url, {}, 15000);
      const coins = rows.map((r) => {
        const sp = r.sparkline_in_7d?.price || [];
        const step = Math.max(1, Math.floor(sp.length / 28));
        return {
          id: r.id, symbol: r.symbol.toUpperCase(), name: r.name, image: r.image, price: r.current_price, rank: r.market_cap_rank,
          cap: r.market_cap, volume: r.total_volume,
          d1: r.price_change_percentage_24h_in_currency ?? r.price_change_percentage_24h, d7: r.price_change_percentage_7d_in_currency,
          spark: sp.filter((_, i) => i % step === 0),
        };
      });
      lastMarkets = { coins, updated: Date.now(), stale: false };
      return lastMarkets;
    });
  } catch {
    marketsRetryAt = Date.now() + 30_000;
    return { ...lastMarkets, stale: true };
  }
}
