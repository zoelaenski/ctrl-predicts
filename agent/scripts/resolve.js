// npm run resolve -- <marketId>   -> asks the agent to resolve one closed market now
import { resolveMarket } from '../src/resolver.js';

const id = process.argv[2];
if (id === undefined) {
  console.log('Usage: npm run resolve -- <marketId>');
  process.exit(1);
}
console.log(JSON.stringify(await resolveMarket(id), null, 2));
