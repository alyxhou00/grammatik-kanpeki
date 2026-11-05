// Build the pitch-accent data (js/pitch.js) from Kanjium's accents.txt.
//
//   curl -LO https://raw.githubusercontent.com/mifunetoshiro/kanjium/master/data/source_files/raw/accents.txt
//   node tools/pitch.mjs accents.txt
//
// accents.txt has one word per line: spelling, reading (empty when it is the spelling), and the
// accents, most common first ("0", "4,0", or with parts of speech "(副)0,(名)3"). This writes
// data/pitch/ja/000.json … 127.json, each { reading in hiragana: { spelling: [accent, …] } }.
// The parts of speech are dropped; the accents keep their order, without repeats.
//
// Kanjium is CC BY-SA 4.0, and so is the converted data (see data/pitch/ja/README.md).
import fs from 'node:fs';
import { SHARDS, shardOf, shardName, hira } from '../js/pitch.js';

const src = process.argv[2];
if (!src) {
  console.error('Usage: node tools/pitch.mjs <path to Kanjium accents.txt>');
  process.exit(1);
}
const out = new URL('../data/pitch/ja/', import.meta.url);

const shards = Array.from({ length: SHARDS }, () => ({}));
let words = 0;
let skipped = 0;
for (const line of fs.readFileSync(src, 'utf8').split(/\r?\n/)) {
  if (!line.trim()) continue;
  const [spelling, readingCol, accentCol] = line.split('\t');
  const reading = hira(readingCol || spelling);
  const accents = [...new Set((accentCol || '').split(',').map((a) => a.replace(/\(.*?\)/g, '').trim()).filter((a) => /^\d+$/.test(a)).map(Number))];
  if (!spelling || !accents.length) { skipped++; continue; }
  const table = shards[shardOf(reading)];
  const entry = (table[reading] ||= {});
  entry[spelling] = [...new Set([...(entry[spelling] || []), ...accents])];
  words++;
}

fs.mkdirSync(out, { recursive: true });
let bytes = 0;
shards.forEach((table, n) => {
  const json = JSON.stringify(table);
  bytes += Buffer.byteLength(json);
  fs.writeFileSync(new URL(shardName(n), out), json + '\n');
});
console.log(`${words} words in ${SHARDS} files, ${(bytes / 1024 / 1024).toFixed(1)} MB${skipped ? `, ${skipped} lines skipped` : ''}`);
