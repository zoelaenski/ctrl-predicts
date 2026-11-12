// Evidence gathering: news headlines (Google News RSS, no key needed) and crypto prices (CoinGecko).

const COINS = {
  near: 'near',
  bitcoin: 'bitcoin',
  btc: 'bitcoin',
  ethereum: 'ethereum',
  eth: 'ethereum',
  solana: 'solana',
  sol: 'solana',
};

export function detectCoin(question) {
  const words = question.toLowerCase().match(/[a-z]+/g) || [];
  for (const w of words) if (COINS[w]) return COINS[w];
  return null;
}

export async function cryptoPrice(coinId) {
  const res = await fetch(
    `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(coinId)}&vs_currencies=usd`,
    { headers: { 'User-Agent': 'ctrl-predicts-agent' } },
  );
  if (!res.ok) throw new Error(`CoinGecko responded ${res.status}`);
  const json = await res.json();
  const price = json?.[coinId]?.usd;
  if (typeof price !== 'number') throw new Error(`CoinGecko returned no USD price for ${coinId}`);
  return {
    coin: coinId,
    price_usd: price,
    source: 'CoinGecko simple/price',
    url: `https://www.coingecko.com/en/coins/${coinId}`,
    observed_at: new Date().toISOString(),
  };
}

/** Price of a coin at (or nearest to) a past moment, from CoinGecko's historical range data. */
export async function cryptoPriceAt(coinId, atMs) {
  const from = Math.floor((atMs - 30 * 60 * 1000) / 1000);
  const to = Math.ceil((atMs + 30 * 60 * 1000) / 1000);
  const url = `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(coinId)}/market_chart/range?vs_currency=usd&from=${from}&to=${to}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'ctrl-predicts-agent' } });
  if (!res.ok) throw new Error(`CoinGecko range responded ${res.status}`);
  const prices = (await res.json()).prices || [];
  if (!prices.length) throw new Error('CoinGecko returned no price points around the close time');
  let best = prices[0];
  for (const p of prices) if (Math.abs(p[0] - atMs) < Math.abs(best[0] - atMs)) best = p;
  return {
    coin: coinId,
    price_usd: best[1],
    observed_at: new Date(best[0]).toISOString(),
    source: 'CoinGecko market_chart/range',
    url: `https://www.coingecko.com/en/coins/${coinId}`,
  };
}

/** "Will NEAR trade above $3.84 ..." -> { direction: 'above', threshold: 3.84 } (or null if not a simple price question). */
export function parseThreshold(question) {
  const m = /\b(above|over|below|under)\s+\$?\s*([\d,]+(?:\.\d+)?)/i.exec(question);
  if (!m) return null;
  const word = m[1].toLowerCase();
  return {
    direction: word === 'above' || word === 'over' ? 'above' : 'below',
    threshold: Number(m[2].replace(/,/g, '')),
  };
}

/** Fixed rule: YES when the price condition is met, otherwise NO. */
export function decideByThreshold(direction, price, threshold) {
  const met = direction === 'above' ? price > threshold : price < threshold;
  return met ? 'YES' : 'NO';
}

const decode = (s) =>
  s
    .replace(/<!\[CDATA\[|\]\]>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();

export function parseNewsRss(xml, max = 8) {
  const out = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const t = /<title>([\s\S]*?)<\/title>/.exec(m[1]);
    const l = /<link>([\s\S]*?)<\/link>/.exec(m[1]);
    const d = /<pubDate>([\s\S]*?)<\/pubDate>/.exec(m[1]);
    const title = t ? decode(t[1]) : '';
    const url = l ? decode(l[1]) : '';
    if (title && url) out.push({ title, url, date: d ? decode(d[1]) : '' });
    if (out.length >= max) break;
  }
  return out;
}

export async function searchNews(query, max = 8) {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
  const res = await fetch(url, { headers: { 'User-Agent': 'ctrl-predicts-agent' } });
  if (!res.ok) throw new Error(`News search responded ${res.status}`);
  return parseNewsRss(await res.text(), max);
}

export async function gatherEvidence(market) {
  const evidence = { news: [], price: null, errors: [] };
  const query = market.question.replace(/^Will /i, '').replace(/\?$/, '');
  try {
    evidence.news = await searchNews(query);
  } catch (e) {
    evidence.errors.push(`news: ${e.message}`);
  }
  if (market.category === 'crypto') {
    const coin = detectCoin(market.question);
    if (coin) {
      try {
        evidence.price = await cryptoPrice(coin);
      } catch (e) {
        evidence.errors.push(`price: ${e.message}`);
      }
    }
  }
  return evidence;
}

/** Turn indexes chosen by the model into real source links (the model can never invent a URL). */
export function pickSources(evidence, indexes = [], usePrice = false) {
  const sources = [];
  for (const i of indexes) {
    const n = evidence.news[Number(i)];
    if (n) sources.push({ title: n.title, url: n.url });
  }
  if (usePrice && evidence.price) {
    sources.push({ title: `${evidence.price.coin} price (${evidence.price.source})`, url: evidence.price.url });
  }
  return sources;
}
