// node scripts/seed-demo.js  -> creates the demo markets for judging.
// One closes in 2 hours (shows the full AI-resolution cycle soon),
// the others stay open through the judging window (Nov 16-18).
import { createMarket } from '../src/chain.js';
import { cryptoPrice } from '../src/evidence.js';

async function cryptoMarket(coinId, label, minutes, pct) {
  const { price_usd } = await cryptoPrice(coinId);
  const threshold = Math.round(price_usd * pct * 100) / 100;
  return { question: `Will ${label} trade above $${threshold} (CoinGecko) when this market closes?`, category: 'crypto', minutes };
}

const list = [
  await cryptoMarket('near', 'NEAR', 120, 1.01),
  await cryptoMarket('ethereum', 'ETH', 3 * 24 * 60, 1.02),
  await cryptoMarket('bitcoin', 'BTC', 5 * 24 * 60, 1.03),
];

for (const m of list) {
  const closes_at_ms = Date.now() + m.minutes * 60 * 1000;
  console.log(`Creating: ${m.question}  (closes in ${m.minutes} min)`);
  await createMarket({ question: m.question, category: m.category, closes_at_ms });
}
console.log('Done.');
