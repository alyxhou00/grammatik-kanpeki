// The authoring format: per-topic schemas, the schema check, and authoring ↔ full cards.
// Run: node tests/authoring.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { LANGS, topicType, formsOf } from '../js/topics.js';
import { AUTHORING_FORMAT, authoringSchema, checkSchema, cardsFromAuthoring, toAuthoring } from '../js/authoring.js';
import { cardProblems } from '../js/cardcheck.js';
import { parseImport } from '../js/store.js';
import { rubyHTML, toKana, toSurface } from '../js/text.js';

const root = new URL('../data/', import.meta.url);
const manifest = JSON.parse(fs.readFileSync(new URL('manifest.json', root), 'utf8'));
const bundled = manifest.files.flatMap((f) => JSON.parse(fs.readFileSync(new URL(f, root), 'utf8')).cards);
const fileOf = (lang, topic, cards, extra = {}) => ({ format: AUTHORING_FORMAT, language: lang, topic, cards, ...extra });

// ---------- every topic has a brief and a schema ----------

for (const [lang, L] of Object.entries(LANGS)) {
  for (const tp of L.topics) {
    assert.ok(tp.about, `${lang}/${tp.id}: topics need an "about" brief (it goes into the authoring schema)`);
    const s = authoringSchema(lang, tp.id);
    assert.deepEqual(JSON.parse(JSON.stringify(s)), s, `${lang}/${tp.id}: schema is plain JSON`);
    assert.equal(s.properties.topic.const, tp.id);
    const prompt = s.properties.cards.items.properties.prompt;
    const main = { rewrite: 'source', cloze: 'sentence', flip: 'word', sentence: 'sentence' }[topicType(lang, tp.id)];
    assert.deepEqual(prompt.required, [main], `${lang}/${tp.id}: the card type decides the prompt`);
  }
}

// ---------- every bundled card, written as an authoring card, passes and comes back the same ----------

let n = 0;
for (const c of bundled) {
  const a = toAuthoring(c);
  const file = fileOf(c.language, c.topic, [a]);
  assert.deepEqual(checkSchema(authoringSchema(c.language, c.topic), file), [], `${c.id}: passes its topic's schema`);
  const [back] = cardsFromAuthoring(file, { today: c.createdAt });
  assert.deepEqual(cardProblems(back), [], `${c.id}: converted card is fine`);
  assert.deepEqual(back.prompt, c.prompt, `${c.id}: prompt survives`);
  assert.deepEqual(back.answer, c.answer, `${c.id}: answer survives`);
  n++;
}

// ---------- the schema catches what LLMs get wrong ----------

{
  const s = authoringSchema('ja', 'verb-conjugation');
  const errs = checkSchema(s, fileOf('ja', 'verb-conjugation', [{
    prompt: { sentence: '朝ごはんを食べる', verb: '食べる', translation: '我吃早餐。' },
    answer: { accepted: [], mistakes: [{ text: '{食|た}べない' }] },
    meta: { verbClass: 'ichidan' },
  }]));
  const has = (part) => assert.ok(errs.some((e) => e.includes(part)), `expected an error with "${part}" in:\n${errs.join('\n')}`);
  has('cards[0].prompt.sentence: needs exactly one blank');
  has('cards[0].prompt.sentence: every kanji needs its reading');
  has('cards[0].prompt.verb: unknown field');
  has('cards[0].prompt.translation: must be an object');
  has('cards[0].answer.accepted: needs at least 1 item');
  has('cards[0].answer.mistakes[0]: "note" is missing');
  has('cards[0].meta.verbClass: must be one of');
  assert.ok(checkSchema(s, fileOf('ja', 'particles', [])).some((e) => e.startsWith('topic:')), 'a file for another topic fails');
  // The register is its own field: one of the course's registers, and German has none.
  assert.deepEqual(s.properties.cards.items.properties.prompt.properties.register.enum, ['plain', 'polite']);
  assert.equal(authoringSchema('de', 'deklination').properties.cards.items.properties.prompt.properties.register, undefined);
  // German has no furigana rule, and the word list takes meanings, not sentences.
  const de = authoringSchema('de', 'vocab');
  assert.deepEqual(checkSchema(de, fileOf('de', 'vocab', [{ prompt: { word: 'die Bank', pos: 'Nomen' }, answer: { accepted: ['Geldinstitut'] } }])), []);
  assert.ok(checkSchema(de, fileOf('de', 'vocab', [{ prompt: { word: 'die Bank' }, answer: { accepted: ['x'], mistakes: [] } }])).some((e) => e.includes('mistakes: unknown field')));
}

// ---------- the card check makes sure a card says which register it wants ----------

{
  const plain = bundled.find((c) => c.id === 'ja-vc-demo-001'); // 食べない, with 食べません as "correct but not ideal"
  const polite = bundled.find((c) => c.id === 'ja-vc-demo-004'); // 来ます
  const fixed = bundled.find((c) => c.id === 'ja-vc-demo-002'); // 飲んで before ください: same in both registers
  const withReg = (c, register) => ({ ...c, prompt: { ...c.prompt, register } });
  const problems = (c) => cardProblems(c).join('\n');
  assert.equal(plain.prompt.register, 'plain');
  assert.equal(polite.prompt.register, 'polite');
  assert.equal(fixed.prompt.register, undefined);
  assert.match(problems(withReg(plain, undefined)), /set prompt.register/);
  assert.match(problems(withReg(polite, undefined)), /set prompt.register/);
  assert.match(problems(withReg(plain, 'polite')), /"polite" but an accepted answer is not/);
  assert.match(problems(withReg(polite, 'plain')), /"plain" but an accepted answer is polite/);
  assert.match(problems(withReg(plain, 'formal')), /not one of: plain, polite/);
  const de = bundled.find((c) => c.language === 'de');
  assert.match(problems(withReg(de, 'plain')), /none in this course/);
}

// ---------- {漢字|-}: a base word may show a kanji without furigana; nothing else may ----------

{
  const card = bundled.find((c) => c.id === 'ja-ct-020'); // 1{人|-}: ひとり, so にん would mislead
  assert.equal(card.prompt.base.word, '1{人|-}');
  assert.equal(rubyHTML(card.prompt.base.word), '1人', 'shown with no furigana');
  assert.equal(toSurface('1{人|-}'), '1人');
  assert.equal(toKana('1{人|-}'), '1人', 'the reading is unknown, so the kanji stays');
  const problems = (c) => cardProblems(c).join('\n');
  assert.deepEqual(cardProblems(card), []);
  assert.match(problems({ ...card, prompt: { ...card.prompt, base: { ...card.prompt.base, word: '1人' } } }), /kanji without furigana: 1人/, 'leaving the markup out is still an error');
  assert.match(problems({ ...card, prompt: { ...card.prompt, base: { ...card.prompt.base, word: '1{人|-}{教|おし}' } } }), /^$/, 'other kanji in the base word keep their reading');
  assert.match(problems({ ...card, prompt: { ...card.prompt, base: { ...card.prompt.base, word: '{一|-}{教|-}室' } } }), /kanji without furigana/);
  assert.match(problems({ ...card, prompt: { ...card.prompt, sentence: card.prompt.sentence.replace('{先生|せんせい}', '{先生|-}') } }), /only allowed in prompt\.base\.word/);
  assert.match(problems({ ...card, answer: { ...card.answer, accepted: ['{一人|-}'] } }), /only allowed in prompt\.base\.word/);

  const schema = authoringSchema('ja', 'counters');
  const written = toAuthoring(card);
  assert.deepEqual(checkSchema(schema, fileOf('ja', 'counters', [written])), [], 'the schema allows it in base.word');
  assert.match(checkSchema(schema, fileOf('ja', 'counters', [{ ...written, prompt: { ...written.prompt, sentence: written.prompt.sentence.replace('{教室|きょうしつ}', '{教室|-}') } }])).join('\n'), /every kanji needs its reading/);
  assert.match(checkSchema(schema, fileOf('ja', 'counters', [{ ...written, answer: { ...written.answer, accepted: ['{一人|-}'] } }])).join('\n'), /every kanji needs its reading/);
}

// ---------- the form registry: one label per form, and the task is that label ----------

{
  const forms = formsOf('ja', 'verb-conjugation');
  const labels = Object.values(forms);
  assert.equal(new Set(labels).size, labels.length, 'two forms never share a label');
  for (const [id, label] of Object.entries(forms)) {
    assert.match(id, /^[a-z]+(-[a-z]+)*$/, `form id "${id}" is lowercase-and-dashes`);
    assert.doesNotMatch(label.replace(/^～/, ''), /～/, `${id}: glosses use … (～ only marks a bare suffix at the start)`);
    assert.doesNotMatch(label, /[ ＋+]/, `${id}: a label is one pattern or one form name, not "form ＋ word"`);
    assert.match(label, /^[^（）]+(（[^（）]+）)?$/, `${id}: label is a name with at most one （gloss）`);
  }
  assert.deepEqual(formsOf('ja', 'particles'), {}, 'topics without a registry have none');
  const used = new Set(bundled.filter((c) => c.topic === 'verb-conjugation').map((c) => c.meta.form));
  assert.deepEqual(Object.keys(forms).filter((f) => !used.has(f)), [], 'every registered form has a bundled card');

  const card = bundled.find((c) => c.id === 'ja-vc-demo2-006'); // てはいけない
  const problems = (c) => cardProblems(c).join('\n');
  assert.deepEqual(cardProblems(card), []);
  assert.match(problems({ ...card, prompt: { ...card.prompt, task: 'てはいけない（不可以…）。' } }), /not the label of form "te-wa-ikenai": it must be "てはいけない（不可以…）"/);
  assert.match(problems({ ...card, prompt: { ...card.prompt, task: undefined } }), /prompt\.task is missing/);
  assert.match(problems({ ...card, meta: { ...card.meta, form: 'te' } }), /not the label of form "te"/);
  assert.match(problems({ ...card, meta: { ...card.meta, form: 'tehaikanai' } }), /meta\.form "tehaikanai" is not one of: nai,/);
  assert.match(problems({ ...card, meta: { verbClass: 'godan' } }), /meta\.form is missing/);

  // Authors name the form; the schema lists the registry, and the label comes from it.
  const s = authoringSchema('ja', 'verb-conjugation').properties.cards.items;
  assert.deepEqual(s.properties.meta.properties.form.enum, Object.keys(forms));
  assert.ok(s.properties.meta.required.includes('form'));
  const written = { prompt: { sentence: '{窓|まど}を___もいいですか。', task: 'whatever' }, answer: { accepted: ['{開|あ}けて'] }, meta: { verbClass: 'shimo-ichidan', form: 'te-mo-ii' } };
  const file = fileOf('ja', 'verb-conjugation', [written]);
  assert.deepEqual(checkSchema(authoringSchema('ja', 'verb-conjugation'), file), []);
  assert.equal(cardsFromAuthoring(file)[0].prompt.task, forms['te-mo-ii'], 'the registry wins over a task the author wrote');
  assert.equal(cardsFromAuthoring(fileOf('ja', 'verb-conjugation', [{ ...written, prompt: { sentence: written.prompt.sentence } }]))[0].prompt.task, forms['te-mo-ii']);
}

// ---------- ids: stable, and distinct within a file ----------

{
  const card = { prompt: { word: 'die Bank' }, answer: { accepted: ['Geldinstitut'] } };
  const other = { prompt: { word: 'die Bank' }, answer: { accepted: ['Sitzmöbel'] } };
  const [a, b, a2] = cardsFromAuthoring(fileOf('de', 'vocab', [card, other, card]));
  const [again] = cardsFromAuthoring(fileOf('de', 'vocab', [card]));
  assert.equal(again.id, a.id, 'the same card gets the same id on every import (updated, not doubled)');
  assert.notEqual(a.id, b.id);
  assert.equal(a2.id, `${a.id}-2`, 'a repeat inside one file still gets its own id');
  assert.equal(a.source, 'generated');
  assert.equal(cardsFromAuthoring(fileOf('de', 'vocab', [card], { source: 'Claude' }))[0].source, 'Claude');
}

// ---------- the app imports authoring files ----------

{
  const good = { prompt: { word: 'die Bank' }, answer: { accepted: ['Geldinstitut'] } };
  const bad = { prompt: { word: 'die Bank', extra: 1 }, answer: { accepted: ['x'] } };
  const p = parseImport(JSON.stringify(fileOf('de', 'vocab', [good, bad])), 'gen.json');
  assert.equal(p.cards.length, 1);
  assert.equal(p.cards[0].topic, 'vocab');
  assert.equal(p.cards[0].source, 'import:gen.json');
  assert.equal(p.invalid.length, 1);
  assert.match(p.invalid[0], /^#2: prompt\.extra: unknown field/);
  assert.match(parseImport(JSON.stringify(fileOf('de', 'nope', [good]))).error, /unknown topic/);
}

console.log(`ok - authoring: schemas for every topic, ${n} bundled cards round-trip, errors, ids, import`);
