// npm run seed   -> creates demo markets on the contract (owner account signs).
// Edit EXTRA below to add your own questions. "minutes" = how long until the market closes.
import { createMarket } from '../src/chain.js';
import { cryptoPrice } from '../src/evidence.js';

const EXTRA = [
  // EDIT ME: questions about real-world events the news search can settle.
  { question: 'Will Nicki Minaj officially announce a release date for a new album before this market closes?', category: 'entertainment', minutes: 24 * 60 },
];

async function cryptoMarket(coinId, label, minutes) {
  const { price_usd } = await cryptoPrice(coinId);
  const threshold = Math.round(price_usd * 1.02 * 100) / 100; // 2% above the current price
  return {
    question: `Will ${label} trade above $${threshold} (CoinGecko) when this market closes?`,
    category: 'crypto',
    minutes,
  };
}

const list = [await cryptoMarket('near', 'NEAR', 120), await cryptoMarket('bitcoin', 'BTC', 120), ...EXTRA];

for (const m of list) {
  const closes_at_ms = Date.now() + m.minutes * 60 * 1000;
  console.log(`Creating: ${m.question}  (closes in ${m.minutes} min)`);
  await createMarket({ question: m.question, category: m.category, closes_at_ms });
}
console.log('Done.');
