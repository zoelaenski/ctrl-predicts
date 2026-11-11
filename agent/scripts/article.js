// npm run article -- <marketId>   -> writes (or rewrites) the AI article for one market
import { getMarket } from '../src/chain.js';
import { writeArticle } from '../src/articles.js';

const id = process.argv[2];
if (id === undefined) {
  console.log('Usage: npm run article -- <marketId>');
  process.exit(1);
}
const article = await writeArticle(await getMarket(id));
console.log(JSON.stringify(article, null, 2));
