// Checks the bundled card files and the topic tree.
// Run: node tests/data.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validateCard, upgradeCard, VERSION, isDemoSource } from '../js/store.js';
import { cardProblems } from '../js/cardcheck.js';
import { wordSegments } from '../js/text.js';
import { LANGS, LANG_FIELDS, CARD_TYPES, topicOf, ancestry, deckIds, typeOf, labelsOf, facetsOf, vocabTopic } from '../js/topics.js';
import { vocabCardFrom, vocabId, savedWordIn } from '../js/cardtypes.js';
import { UI } from '../js/i18n.js';

const errors = [];
const fail = (id, msg) => errors.push(`${id}: ${msg}`);

// ---------- topic tree ----------

for (const [lang, L] of Object.entries(LANGS)) {
  const seen = new Set();
  for (const tp of L.topics) {
    if (seen.has(tp.id)) fail(`${lang}/${tp.id}`, 'duplicate topic id');
    seen.add(tp.id);
    if (tp.parent && !topicOf(lang, tp.parent)) fail(`${lang}/${tp.id}`, `unknown parent ${tp.parent}`);
    if (ancestry(lang, tp.id).at(-1).parent) fail(`${lang}/${tp.id}`, 'parent chain has a cycle');
    if (!CARD_TYPES.includes(typeOf({ language: lang, topic: tp.id }))) fail(`${lang}/${tp.id}`, 'no card type');
  }
}
// ---------- every course offers the same things ----------

{
  const keysOf = (o, p = '') => Object.entries(o).flatMap(([k, v]) =>
    v && typeof v === 'object' && !Array.isArray(v) ? keysOf(v, `${p}${k}.`) : [`${p}${k}`]).sort();
  const [first, ...rest] = Object.keys(LANGS);
  // facetLabels only names the facets a course's own topics use.
  const uiKeys = (lang) => keysOf(UI[lang]).filter((k) => !k.startsWith('facetLabels.'));
  for (const lang of rest) {
    assert.deepEqual(keysOf(LANGS[lang]), keysOf(LANGS[first]), `${lang}: same course settings as ${first}`);
    assert.deepEqual(uiKeys(lang), uiKeys(first), `${lang}: same UI strings as ${first}`);
  }
  for (const lang of Object.keys(LANGS)) {
    // Every course sets every course field, with the right type, and nothing else.
    for (const [field, type] of Object.entries(LANG_FIELDS)) {
      assert.equal(typeof LANGS[lang][field], type, `${lang}: course field "${field}" is a ${type}`);
      assert.ok(LANGS[lang][field] !== null, `${lang}: course field "${field}" is set`);
    }
    assert.deepEqual(Object.keys(LANGS[lang]).sort(), Object.keys(LANG_FIELDS).sort(), `${lang}: only the fields in LANG_FIELDS`);
    for (const key of ['title', 'html']) assert.ok(LANGS[lang].brand[key], `${lang}: brand.${key}`);
    assert.ok(UI[lang], `${lang}: UI strings`);
    assert.equal(typeOf({ language: lang, topic: vocabTopic(lang)?.id }), 'flip', `${lang}: has a word list (flip topic "vocab")`);
    for (const tp of LANGS[lang].topics) {
      for (const key of Object.keys(facetsOf(lang, tp.id))) assert.ok(UI[lang].facetLabels[key], `${lang}/${tp.id}: facet "${key}" has a label`);
    }
  }
}

// Sub-topics inherit type and labels, and a parent deck includes its sub-topics.
assert.deepEqual(deckIds('de', 'deklination'), ['deklination', 'n-deklination']);
assert.equal(typeOf({ language: 'de', topic: 'n-deklination' }), 'cloze');
assert.equal(labelsOf('de', 'n-deklination').placeholder, labelsOf('de', 'deklination').placeholder);
assert.deepEqual(ancestry('de', 'n-deklination').map((x) => x.id), ['n-deklination', 'deklination']);

// ---------- version 1 → 2 ----------

{
  const v1 = {
    id: 'x', language: 'ja', topic: 'verb-conjugation', source: 't',
    prompt: { verb: '{食|た}べる', meaning: '吃', formLabel: 'ない形', sentence: '___。', translation: { 'zh-Hant': '不吃。' } },
    answer: { accepted: ['{食|た}べない'] },
  };
  const v2 = upgradeCard(v1);
  assert.deepEqual(v2.prompt, { sentence: '___。', translation: { 'zh-Hant': '不吃。' }, base: { word: '{食|た}べる', meaning: '吃', pos: '動詞' }, task: 'ない形' });
  assert.deepEqual(validateCard(v2), []);
  const de = upgradeCard({ id: 'y', language: 'de', topic: 'nominalisierung', source: 't', prompt: { verbalstil: 'Wenn …' }, answer: { accepted: ['Bei …'] } });
  assert.equal(de.prompt.source, 'Wenn …');
  assert.equal('verbalstil' in de.prompt, false);
  assert.equal(upgradeCard(v2), v2, 'current cards are returned unchanged');
  assert.deepEqual(validateCard({ ...v2, topic: 'nope' }), ['unknown topic "nope"']);
}

// ---------- saved words: one card per sense ----------

{
  const bench = { lemma: 'die Bank', meaning: 'Sitzmöbel für mehrere Personen', pos: 'Nomen' };
  const bank = { lemma: 'die Bank', meaning: 'Geldinstitut', pos: 'Nomen' };
  const a = vocabCardFrom(bench, null, 'de');
  const b = vocabCardFrom(bank, null, 'de');
  assert.notEqual(a.id, b.id, 'two senses of one word get two cards');
  assert.equal(vocabCardFrom({ ...bench, meaning: ' Sitzmöbel  für mehrere Personen ' }, null, 'de').id, a.id, 'same sense → same id (stable across devices)');
  assert.equal(vocabId('ja', { lemma: '{方|かた}', meaning: '人（敬稱）' }), vocabId('ja', { lemma: '方', meaning: '人（敬稱）' }), 'furigana does not change the id');
  assert.deepEqual(validateCard(a), []);
  assert.equal(savedWordIn([a, b], bench), a);
  assert.equal(savedWordIn([a, b], bank), b);
  assert.equal(savedWordIn([a], bank), null, 'saving one sense does not mark the other as saved');
  // A card from before senses existed (id from the spelling only, no meta.sense) is still found by its meaning.
  const old = { ...a, id: 'de-vocab-die Bank', meta: { savedFrom: 'x' } };
  assert.equal(savedWordIn([old], bench), old);
  assert.equal(savedWordIn([old], bank), null);
  // Editing the meaning of a saved card keeps it linked to the word it was saved from.
  const edited = { ...a, answer: { accepted: ['Sitzbank'] } };
  assert.equal(savedWordIn([edited], bench), edited);
}

// Latin-script words are not matched inside longer words.
assert.deepEqual(wordSegments('Der Mann wartet an der Tür.', [{ text: 'an' }]).filter((x) => x.word).map((x) => x.text), ['an']);
assert.equal(wordSegments('Der Mann wartet.', [{ text: 'an' }]).filter((x) => x.word).length, 0);

// ---------- demo sources (scheduled after the user's own cards) ----------

for (const s of ['demo', 'demo2', 'demo3', 'demo10', 'demo1.5', 'demo2.25', 'demo1.5-n5', 'demo-n5', 'demo2-b1', 'demo-b2-extra']) assert.ok(isDemoSource(s), `${s} is a demo source`);
for (const s of ['', undefined, 'user', 'demographie', 'Demo', 'demo-', 'my-demo', 'demo n5', 'import:demo.json', 'demo1.', 'demo.5', 'demo1.5.2', 'demo1,5']) assert.ok(!isDemoSource(s), `${s} is not a demo source`);

// ---------- bundled cards ----------

const root = new URL('../data/', import.meta.url);
const manifest = JSON.parse(fs.readFileSync(new URL('manifest.json', root), 'utf8'));
const ids = new Set();
let checked = 0;

for (const file of manifest.files) {
  const data = JSON.parse(fs.readFileSync(new URL(file, root), 'utf8'));
  assert.equal(data.format, 'grammatik-kanpeki.cards', file);
  assert.equal(data.version, VERSION, `${file}: bundled files use the current version`);
  for (const c of data.cards) {
    checked++;
    if (ids.has(c.id)) fail(c.id, 'duplicate id');
    ids.add(c.id);
    if (/\.demo(\d+(\.\d+)?)?\.json$/.test(file) && !isDemoSource(c.source)) fail(c.id, `card in a demo file needs a demo source, not "${c.source}"`);
    if (upgradeCard(c) !== c) fail(c.id, 'uses version 1 fields');
    if (!c.source) fail(c.id, 'source missing');
    // Answer lists, hoverable words, facet values, furigana: see js/cardcheck.js.
    for (const e of cardProblems(c)) fail(c.id, e);
  }
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(`ok - topic tree, v1 upgrade, ${checked} cards in ${manifest.files.length} files`);
