// Checks the bundled card files.
// Run: node tests/data.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validateCard } from '../js/store.js';
import { checkAnswer } from '../js/check.js';
import { wordSegments, toSurface, toKana, BLANK } from '../js/text.js';

const root = new URL('../data/', import.meta.url);
const manifest = JSON.parse(fs.readFileSync(new URL('manifest.json', root), 'utf8'));
const ids = new Set();
let checked = 0;
const errors = [];
const fail = (id, msg) => errors.push(`${id}: ${msg}`);

for (const file of manifest.files) {
  const data = JSON.parse(fs.readFileSync(new URL(file, root), 'utf8'));
  assert.equal(data.format, 'grammatik-kanpeki.cards', file);
  for (const c of data.cards) {
    checked++;
    if (ids.has(c.id)) fail(c.id, 'duplicate id');
    ids.add(c.id);
    for (const e of validateCard(c)) fail(c.id, e);
    if (!c.source) fail(c.id, 'source missing');

    // Every answer list is judged the way the card says.
    for (const a of c.answer.accepted) if (checkAnswer(c, toSurface(a)).verdict !== 'correct') fail(c.id, `accepted not correct: ${a}`);
    for (const a of c.answer.acceptable || []) if (checkAnswer(c, toSurface(a.text)).verdict !== 'acceptable') fail(c.id, `acceptable not matched: ${a.text}`);
    for (const a of c.answer.mistakes || []) if (checkAnswer(c, toSurface(a.text)).verdict !== 'mistake') fail(c.id, `mistake not matched: ${a.text}`);

    if (c.topic === 'verb-conjugation') {
      const p = c.prompt;
      if (p.sentence.split(BLANK).length !== 2) fail(c.id, 'sentence needs exactly one ___');
      if (!/[{]/.test(p.verb) && /[一-鿿]/.test(p.verb)) fail(c.id, 'verb has kanji without furigana');
      for (const a of c.answer.accepted) {
        if (/[一-鿿]/.test(toKana(a))) fail(c.id, `answer has kanji without furigana: ${a}`);
      }
      // Hoverable words: each must be found in the sentence, in order, with a meaning.
      const words = p.words || [];
      const found = wordSegments(p.sentence, words).filter((s) => s.word).length;
      if (found !== words.length) fail(c.id, `only ${found}/${words.length} words found in the sentence`);
      for (const w of words) {
        if (!w.meaning || !w.pos) fail(c.id, `word without meaning/pos: ${w.text}`);
        if (/[一-鿿]/.test(toKana(w.lemma || w.text))) fail(c.id, `word has kanji without furigana: ${w.text}`);
      }
      if (/[一-鿿]/.test(toKana(p.sentence))) fail(c.id, 'sentence has kanji without furigana');
    }
  }
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(`ok - ${checked} cards in ${manifest.files.length} files`);
