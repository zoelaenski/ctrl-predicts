import { chatJson } from './llm.js';
import { gatherEvidence, pickSources } from './evidence.js';
import { patchEntry } from './store.js';
import { cfg } from './config.js';
import { yesProbabilityPercent } from './util.js';

/** The AI "encyclopedia" part: write a short neutral entry from the market price and gathered evidence. */
export async function writeArticle(market) {
  const evidence = await gatherEvidence(market);
  const prob = yesProbabilityPercent(market.yes_pool, market.no_pool);

  const input = {
    question: market.question,
    category: market.category,
    closes_at: new Date(market.closes_at_ms).toISOString(),
    market_yes_probability_percent: prob,
    news: evidence.news.map((n, i) => ({ index: i, title: n.title, date: n.date })),
    price: evidence.price,
  };

  const reply = await chatJson([
    {
      role: 'system',
      content:
        'You write short, neutral encyclopedia entries about a yes/no question, using only the evidence provided. ' +
        'Never invent facts or links. If evidence is thin, say so plainly. ' +
        'Reply with ONLY a JSON object: {"title": string, "summary": string (1-2 sentences, mention the market odds if present), ' +
        '"body_md": string (markdown, 2-4 short sections), "source_indexes": number[] (indexes into the news list you used), ' +
        '"use_price": boolean (true if you used the price data)}.',
    },
    { role: 'user', content: JSON.stringify(input) },
  ]);

  const article = {
    title: String(reply.title || market.question),
    summary: String(reply.summary || ''),
    body_md: String(reply.body_md || ''),
    sources: pickSources(evidence, reply.source_indexes || [], Boolean(reply.use_price)),
    updated_at: new Date().toISOString(),
    model: cfg.model,
  };
  await patchEntry(market.id, { article });
  return article;
}
