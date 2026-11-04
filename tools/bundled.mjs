// The app's bundled cards (data/manifest.json), for the command-line tools.
import fs from 'node:fs';

const root = new URL('../data/', import.meta.url);

export function bundledCards() {
  const manifest = JSON.parse(fs.readFileSync(new URL('manifest.json', root), 'utf8'));
  return manifest.files.flatMap((f) => JSON.parse(fs.readFileSync(new URL(f, root), 'utf8')).cards);
}
