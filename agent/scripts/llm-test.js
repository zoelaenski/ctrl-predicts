// npm run models  ->  lists models on your NEAR AI Cloud key and tests the configured model.
import { cfg } from '../src/config.js';
import { listModels, chat } from '../src/llm.js';

const models = await listModels();
console.log(`${models.length} models available. First 40:`);
console.log(models.slice(0, 40).join('\n'));
console.log(`\nConfigured model: ${cfg.model}  (${models.includes(cfg.model) ? 'found' : 'NOT FOUND in the list above: set LLM_MODEL in .env'})`);

console.log('\nTest reply:');
console.log(await chat([{ role: 'user', content: 'Reply with the single word: ready' }]));
