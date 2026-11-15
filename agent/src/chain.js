import { Account, JsonRpcProvider, KeyPairSigner, teraToGas } from 'near-api-js';
import { cfg } from './config.js';

const provider = new JsonRpcProvider({ url: cfg.rpcUrl });
// Extra read endpoints tried when the main one is rate limited (comma-separated RPC_FALLBACKS in .env).
const FALLBACKS = (process.env.RPC_FALLBACKS || 'https://rpc.testnet.near.org,https://near-testnet.drpc.org')
  .split(',').map((u) => u.trim()).filter(Boolean);
const providers = [provider, ...FALLBACKS.map((url) => new JsonRpcProvider({ url }))];

// Reads are cached for a few seconds and shared between simultaneous callers,
// so page loads and the agent loop do not burn the free RPC rate limit.
const TTL_MS = 8000;
const cache = new Map();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function readWithFailover(method, args) {
  let lastErr;
  for (let round = 0; round < 2; round++) {
    for (const p of providers) {
      try {
        return await p.callFunction({ contractId: cfg.contractId, method, args });
      } catch (e) {
        lastErr = e;
        if (!/429|rate limit|fetch failed|timeout|ECONN|ENOTFOUND|503|502/i.test(String(e?.message || e))) throw e;
      }
    }
    await sleep(600);
  }
  throw lastErr;
}

export function view(method, args = {}) {
  const key = method + JSON.stringify(args);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.p;
  const p = readWithFailover(method, args);
  cache.set(key, { at: Date.now(), p });
  p.catch(() => cache.delete(key));
  return p;
}

function accountFor(id, key) {
  if (!id || !key) throw new Error(`Missing key in agent/.env for account ${id}`);
  return new Account(id, provider, KeyPairSigner.fromSecretKey(key));
}

function send(account, methodName, args) {
  return account.callFunction({
    contractId: cfg.contractId,
    methodName,
    args,
    gas: teraToGas('30'),
    deposit: BigInt(0),
  });
}

// ---- reads (free) ----
export const getMarkets = () => view('get_markets', { from_index: 0, limit: 100 });
export const getMarket = (id) => view('get_market', { id: Number(id) });
export const getStats = () => view('get_stats', {});

// ---- writes ----
/** Owner account creates a market. */
export function createMarket({ question, category, closes_at_ms }) {
  return send(accountFor(cfg.ownerId, cfg.ownerKey), 'create_market', { question, category, closes_at_ms });
}

/** Resolver agent account settles a closed market. */
export function resolveOnChain({ market_id, outcome, evidence_hash }) {
  return send(accountFor(cfg.resolverId, cfg.resolverKey), 'resolve', {
    market_id: Number(market_id),
    outcome,
    evidence_hash,
  });
}
