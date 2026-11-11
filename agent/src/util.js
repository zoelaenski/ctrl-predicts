import { createHash } from 'node:crypto';

/** Pull the first JSON object out of an LLM reply (handles ```json fences and chatter). */
export function extractJson(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) {
    throw new Error('No JSON object found in model reply');
  }
  return JSON.parse(text.slice(start, end + 1));
}

export function sha256Hex(value) {
  return createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
}

/** YES probability in percent (two decimals) from pool strings, or null if no bets yet. */
export function yesProbabilityPercent(yesPool, noPool) {
  const yes = BigInt(yesPool);
  const no = BigInt(noPool);
  const total = yes + no;
  if (total === BigInt(0)) return null;
  return Number((yes * BigInt(10000)) / total) / 100;
}
