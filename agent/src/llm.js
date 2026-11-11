import { cfg } from './config.js';
import { extractJson } from './util.js';

export async function chat(messages, { temperature = 0.2 } = {}) {
  if (!cfg.apiKey) throw new Error('NEARAI_API_KEY is missing in agent/.env');
  const res = await fetch(`${cfg.llmBase}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
    body: JSON.stringify({ model: cfg.model, messages, temperature }),
  });
  if (!res.ok) throw new Error(`LLM ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error('LLM returned an empty reply');
  return content;
}

export async function chatJson(messages, opts) {
  const text = await chat(messages, opts);
  return extractJson(text);
}

export async function listModels() {
  const res = await fetch(`${cfg.llmBase}/models`, { headers: { Authorization: `Bearer ${cfg.apiKey}` } });
  if (!res.ok) throw new Error(`LLM ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json = await res.json();
  return (json.data || []).map((m) => m.id);
}
