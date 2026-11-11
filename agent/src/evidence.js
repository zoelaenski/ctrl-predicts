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
