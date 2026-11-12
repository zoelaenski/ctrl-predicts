import { chatJson } from './llm.js';
import { gatherEvidence, pickSources, detectCoin, cryptoPriceAt, parseThreshold, decideByThreshold } from './evidence.js';
import { getMarket, resolveOnChain } from './chain.js';
import { getEntry, patchEntry } from './store.js';
import { sha256Hex } from './util.js';
import { cfg } from './config.js';

/**
 * Objective price questions are settled by a fixed rule, not by AI judgment:
 * look up the price at the close time and compare it with the threshold in the question.
 * Returns null when the question is not a simple price question (the AI path is used instead).
 */
async function resolveByRule(market) {
  if (market.category !== 'crypto') return null;
  const coin = detectCoin(market.question);
  const rule = parseThreshold(market.question);
  if (!coin || !rule) return null;
  const point = await cryptoPriceAt(coin, market.closes_at_ms);
  const outcome = decideByThreshold(rule.direction, point.price_usd, rule.threshold);
  const met = outcome === 'YES';
  const reasoning =
    `Rule-based resolution: the closest CoinGecko data point to the market close (${new Date(market.closes_at_ms).toISOString()}) ` +
    `is ${point.observed_at}, when ${coin} traded at $${point.price_usd}. The question asks whether the price is ${rule.direction} ` +
    `$${rule.threshold}; that condition is ${met ? 'met' : 'not met'}, so the market resolves ${outcome}.`;
  return {
    outcome,
    reasoning,
    sources: [{ title: `${coin} price history (${point.source})`, url: point.url }],
    data: point,
    method: 'rule',
  };
}

/**
 * Resolve one closed market: gather evidence, let the model decide YES / NO / UNCLEAR,
 * and (only when it is decided) send the answer on-chain from the resolver agent account.
 * The on-chain evidence_hash is the SHA-256 of the exact reasoning + sources saved in the API,
 * so anyone can verify the saved evidence was not changed afterwards.
 */
export async function resolveMarket(marketId) {
  const market = await getMarket(marketId);
  if (market.status === 'resolved') return { resolved: false, reason: 'already resolved' };
  if (market.status !== 'closed') return { resolved: false, reason: `market is ${market.status}, not closed yet` };

  // 1) Objective price questions: fixed rule on historical price data (no AI judgment needed).
  let ruled = null;
  try {
    ruled = await resolveByRule(market);
  } catch (e) {
    console.log(`[agent] rule-based resolution failed for market ${marketId}: ${e.message} (falling back to the AI)`);
  }
  if (ruled) {
    const record = {
      market_id: Number(marketId),
      question: market.question,
      outcome: ruled.outcome,
      reasoning: ruled.reasoning,
      sources: ruled.sources,
      data: ruled.data,
    };
    const evidence_hash = sha256Hex(record);
    await resolveOnChain({ market_id: marketId, outcome: ruled.outcome, evidence_hash });
    const resolution = { ...record, evidence_hash, method: 'rule', resolved_at: new Date().toISOString() };
    await patchEntry(marketId, { resolution });
    return { resolved: true, resolution };
  }

  // 2) Everything else: the AI weighs news evidence and may answer UNCLEAR.
  const evidence = await gatherEvidence(market);
  const input = {
    question: market.question,
    category: market.category,
    closed_at: new Date(market.closes_at_ms).toISOString(),
    now: new Date().toISOString(),
    news: evidence.news.map((n, i) => ({ index: i, title: n.title, date: n.date })),
    price: evidence.price,
  };

  const decision = await chatJson([
    {
      role: 'system',
      content:
        'You are a careful market resolver. Decide whether the question resolves YES or NO using ONLY the evidence provided. ' +
        'If the evidence is missing, contradictory or does not clearly settle it, answer UNCLEAR. Never guess. ' +
        'Reply with ONLY a JSON object: {"outcome": "YES" | "NO" | "UNCLEAR", "reasoning": string (2-5 sentences), ' +
        '"source_indexes": number[] (news indexes you relied on), "use_price": boolean}.',
    },
    { role: 'user', content: JSON.stringify(input) },
  ]);

  const outcome = String(decision.outcome || '').toUpperCase();
  const attempt = {
    at: new Date().toISOString(),
    outcome,
    reasoning: String(decision.reasoning || ''),
  };

  if (outcome !== 'YES' && outcome !== 'NO') {
    const prev = await getEntry(marketId);
    await patchEntry(marketId, {
      resolution_attempts: [...(prev.resolution_attempts || []), attempt],
    });
    return { resolved: false, reason: 'model answered UNCLEAR', attempt };
  }

  const sources = pickSources(evidence, decision.source_indexes || [], Boolean(decision.use_price));
  const record = {
    market_id: Number(marketId),
    question: market.question,
    outcome,
    reasoning: attempt.reasoning,
    sources,
    data: decision.use_price ? evidence.price : null,
  };
  const evidence_hash = sha256Hex(record);

  await resolveOnChain({ market_id: marketId, outcome, evidence_hash });

  const resolution = { ...record, evidence_hash, method: 'ai', resolved_at: new Date().toISOString(), model: cfg.model };
  await patchEntry(marketId, { resolution });
  return { resolved: true, resolution };
}
