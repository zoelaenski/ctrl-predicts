import { getMarkets } from './chain.js';
import { getEntry } from './store.js';
import { writeArticle } from './articles.js';
import { resolveMarket } from './resolver.js';

const RETRY_AFTER_MS = 10 * 60 * 1000; // wait before retrying a market the model called UNCLEAR
const MAX_ATTEMPTS = 3;

/** One pass of the agent: write missing articles, resolve closed markets. */
export async function tick(log = console.log) {
  const markets = await getMarkets();
  for (const m of markets) {
    try {
      const entry = await getEntry(m.id);

      if (!entry.article) {
        log(`[agent] writing article for market ${m.id}`);
        await writeArticle(m);
      }

      if (m.status === 'closed') {
        const attempts = entry.resolution_attempts || [];
        const last = attempts[attempts.length - 1];
        const waiting = last && Date.now() - new Date(last.at).getTime() < RETRY_AFTER_MS;
        if (attempts.length >= MAX_ATTEMPTS) continue; // needs a human
        if (waiting) continue;
        log(`[agent] resolving market ${m.id}`);
        const result = await resolveMarket(m.id);
        log(`[agent] market ${m.id}: ${result.resolved ? 'resolved ' + result.resolution.outcome : result.reason}`);
      }
    } catch (e) {
      log(`[agent] market ${m.id} failed: ${e.message}`);
    }
  }
}
