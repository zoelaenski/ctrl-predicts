import express from 'express';
import { cfg } from './config.js';
import { getMarkets, getMarket, getStats, view } from './chain.js';
import { allEntries, getEntry } from './store.js';
import { tick } from './loop.js';

const app = express();

// Open CORS so the website (a different origin) can call this API.
app.use((req, res, next) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

const wrap = (fn) => async (req, res) => {
  try {
    await fn(req, res);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

app.get('/api/health', (req, res) =>
  res.json({ ok: true, contract: cfg.contractId, resolver: cfg.resolverId, model: cfg.model }),
);

// List: market summary plus article headline/summary
app.get(
  '/api/entries',
  wrap(async (req, res) => {
    const [markets, store] = await Promise.all([getMarkets(), allEntries()]);
    let rows = markets.map((m) => {
      const a = store[String(m.id)]?.article;
      return {
        market: m,
        article: a ? { title: a.title, summary: a.summary, updated_at: a.updated_at } : null,
      };
    });
    if (req.query.category) rows = rows.filter((r) => r.market.category === req.query.category);
    if (req.query.status) rows = rows.filter((r) => r.market.status === req.query.status);
    res.json(rows);
  }),
);

// One entry: market, full article, resolution (if any)
app.get(
  '/api/entries/:id',
  wrap(async (req, res) => {
    const market = await getMarket(req.params.id);
    const entry = await getEntry(req.params.id);
    res.json({ market, article: entry.article || null, resolution: entry.resolution || null });
  }),
);

app.get(
  '/api/stats',
  wrap(async (req, res) => res.json(await getStats())),
);

// A wallet's positions across all markets (used by the Portfolio page and the Claim button)
app.get(
  '/api/positions/:account',
  wrap(async (req, res) => {
    const markets = await getMarkets();
    const out = [];
    for (const m of markets) {
      const p = await view('get_position', { market_id: m.id, account_id: req.params.account });
      if (p.yes !== '0' || p.no !== '0') out.push({ market_id: m.id, ...p });
    }
    res.json(out);
  }),
);

app.listen(cfg.port, () => {
  console.log(`Ctrl Predicts API on http://localhost:${cfg.port}  (contract ${cfg.contractId})`);
  if (cfg.autoAgent) {
    console.log(`Agent loop on: checking every ${cfg.tickSeconds}s`);
    const run = () => tick().catch((e) => console.log('[agent] tick failed:', e.message));
    setTimeout(run, 5000);
    setInterval(run, cfg.tickSeconds * 1000);
  }
});
