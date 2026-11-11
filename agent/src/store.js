// Tiny JSON-file store for articles and resolutions (always re-read from disk, so scripts and server stay in sync).
import { promises as fs } from 'node:fs';
import path from 'node:path';

const FILE = path.resolve('data/entries.json');

async function load() {
  try {
    return JSON.parse(await fs.readFile(FILE, 'utf8'));
  } catch {
    return {};
  }
}

export const allEntries = load;

export async function getEntry(id) {
  const data = await load();
  return data[String(id)] || {};
}

export async function patchEntry(id, patch) {
  const data = await load();
  data[String(id)] = { ...(data[String(id)] || {}), ...patch };
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(data, null, 2));
  return data[String(id)];
}
