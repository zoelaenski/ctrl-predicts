// node scripts/seed-more.js -> entertainment + football markets, all closing in 7 days.
import { createMarket } from '../src/chain.js';

const DAYS = 7;
const W = 'between 13 and 19 November 2026';
const list = [
  { question: `Will Drake release a new song or music video ${W}?`, category: 'entertainment' },
  { question: `Will Eminem release a new song or music video ${W}?`, category: 'entertainment' },
  { question: `Will Rihanna officially announce a release date for a new album ${W}?`, category: 'entertainment' },
  { question: `Will Erling Haaland score in a Premier League match ${W}?`, category: 'sports' },
  { question: `Will Arsenal win a Premier League match ${W}?`, category: 'sports' },
  { question: `Will Mohamed Salah score in a Premier League match ${W}?`, category: 'sports' },
];

for (const m of list) {
  const closes_at_ms = Date.now() + DAYS * 24 * 60 * 60 * 1000;
  console.log(`Creating: ${m.question}`);
  await createMarket({ question: m.question, category: m.category, closes_at_ms });
}
console.log('Done.');
