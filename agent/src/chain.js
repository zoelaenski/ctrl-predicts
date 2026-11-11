import { Account, JsonRpcProvider, KeyPairSigner, teraToGas } from 'near-api-js';
import { cfg } from './config.js';

const provider = new JsonRpcProvider({ url: cfg.rpcUrl });

export async function view(method, args = {}) {
  return provider.callFunction({ contractId: cfg.contractId, method, args });
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
