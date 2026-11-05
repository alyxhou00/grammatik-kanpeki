// Checks the add / edit card form: form values → card, and card → form values → the same card.
// Run: node tests/cardform.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { emptyValues, valuesFromCard, cardFromValues, formErrors, missingFurigana, makeId, USER_SOURCE } from '../js/cardform.js';
import { validateCard } from '../js/store.js';
import { LANGS } from '../js/topics.js';
import { checkAnswer } from '../js/check.js';

const today = '2026-11-04';
const newId = (lang, topic) => `${lang}-${topic}-u1`;

// ---------- a new cloze card from the form ----------
{
  const v = {
    ...emptyValues('ja', 'verb-conjugation'),
    sentence: '{毎朝|まいあさ}パンを___。',
    baseWord: '{食|た}べる', baseMeaning: '吃', basePos: '動詞',
    task: 'ます形',
    register: 'polite',
    accepted: '{食|た}べます\n',
    acceptable: [{ text: 'taberu', note: '要用禮貌形。' }, { text: '', note: 'empty rows are dropped' }],
    mistakes: [],
    translation: { 'zh-Hant': '每天早上吃麵包。', en: '' },
    explanation: { 'zh-Hant': '', en: '' },
    meta: { verbClass: 'shimo-ichidan' },
    tags: 'ます形, 下一段 ',
  };
  assert.deepEqual(formErrors(v, 'ja'), {});
  const c = cardFromValues(v, { lang: 'ja', newId, today });
  assert.deepEqual(c, {
    id: 'ja-verb-conjugation-u1', language: 'ja', createdAt: today, topic: 'verb-conjugation', source: USER_SOURCE,
    tags: ['ます形', '下一段'],
    prompt: {
      sentence: '{毎朝|まいあさ}パンを___。', base: { word: '{食|た}べる', meaning: '吃', pos: '動詞' },
      task: { 'zh-Hant': 'ます形' }, register: 'polite', translation: { 'zh-Hant': '每天早上吃麵包。' },
    },
    answer: { accepted: ['{食|た}べます'], acceptable: [{ text: 'たべる', note: '要用禮貌形。' }] },
    meta: { verbClass: 'shimo-ichidan' },
  });
  assert.deepEqual(validateCard(c), []);
  assert.equal(checkAnswer(c, 'tabemasu').verdict, 'correct', 'kana answers work through the furigana');
  assert.equal(checkAnswer(c, 'たべる').verdict, 'acceptable', 'romaji rows are stored as kana');
  assert.deepEqual(missingFurigana(v, 'ja'), []);
  assert.deepEqual(missingFurigana({ ...v, accepted: '食べます' }, 'ja'), ['食べます']);
  assert.equal(valuesFromCard(c).register, 'polite');
  const reg = (extra) => cardFromValues({ ...v, ...extra }, { lang: 'ja', newId, today }).prompt.register;
  assert.equal(reg({ register: '' }), undefined, 'no register chosen');
  assert.equal(reg({ register: 'x' }), undefined, 'only known registers');
  assert.equal(reg({ topic: 'vocab', word: '{犬|いぬ}' }), undefined, 'not on word cards');
}

// ---------- required fields ----------
assert.deepEqual(formErrors(emptyValues('de', 'nominalisierung'), 'de'), { source: 'required', accepted: 'required' });
assert.deepEqual(formErrors({ ...emptyValues('de', 'deklination'), sentence: 'Ich helfe dem ___ und dem ___.', accepted: 'x' }, 'de'), { sentence: 'blank' });
assert.deepEqual(formErrors({ ...emptyValues('ja', 'vocab'), word: '{犬|いぬ}', accepted: '狗' }, 'ja'), {});

// ---------- flip card: translation belongs to the example ----------
{
  const v = { ...emptyValues('ja', 'vocab'), word: '{犬|いぬ}', accepted: '狗', translation: { 'zh-Hant': '有狗。' } };
  assert.equal(cardFromValues(v, { lang: 'ja', newId, today }).prompt.exampleTranslation, undefined, 'no example, no translation');
  const c = cardFromValues({ ...v, example: '{犬|いぬ}がいる。' }, { lang: 'ja', newId, today });
  assert.deepEqual(c.prompt, { word: '{犬|いぬ}', example: '{犬|いぬ}がいる。', exampleTranslation: { 'zh-Hant': '有狗。' } });
  assert.deepEqual(validateCard(c), []);
}

// ---------- sentence card: a whole sentence, translations as the answer ----------
{
  const v = { ...emptyValues('ja', 'sentences'), sentence: '{今日|きょう}は{暑|あつ}い。', accepted: '今天很熱。\n今天好熱。' };
  assert.deepEqual(formErrors(v, 'ja'), {});
  assert.deepEqual(formErrors({ ...v, sentence: ' ' }, 'ja'), { sentence: 'required' });
  assert.deepEqual(missingFurigana(v, 'ja'), [], 'translations are Chinese, not text that needs furigana');
  assert.deepEqual(missingFurigana({ ...v, sentence: '今日は暑い。' }, 'ja'), ['今日は暑い。']);
  const c = cardFromValues({ ...v, register: 'plain', mistakes: [{ text: 'x', note: 'y' }] }, { lang: 'ja', newId, today });
  assert.deepEqual(c.prompt, { sentence: '{今日|きょう}は{暑|あつ}い。' }, 'no register on sentence cards');
  assert.deepEqual(c.answer, { accepted: ['今天很熱。', '今天好熱。'] }, 'no mistakes on sentence cards');
  assert.deepEqual(validateCard(c), []);
  assert.equal(valuesFromCard(c).sentence, v.sentence);
}

// ---------- editing keeps what the form does not show ----------
const root = new URL('../data/', import.meta.url);
const manifest = JSON.parse(fs.readFileSync(new URL('manifest.json', root), 'utf8'));
let roundTrips = 0;
for (const file of manifest.files) {
  for (const card of JSON.parse(fs.readFileSync(new URL(file, root), 'utf8')).cards) {
    const back = cardFromValues(valuesFromCard(card), { lang: card.language, existing: card, newId, today });
    const { updatedAt, ...rest } = back;
    assert.equal(updatedAt, today);
    // Saving an unchanged card gives the same card. Plain-string notes and hints come back as { noteLang: text }.
    const norm = (c) => JSON.parse(JSON.stringify(c, (k, x) => (['note', 'hint', 'task'].includes(k) && typeof x === 'string' ? { [LANGS[card.language].noteLang]: x } : x)));
    assert.deepEqual(norm(rest), norm(card), card.id);
    roundTrips++;
  }
}

// An edit changes only what was changed.
{
  const card = {
    id: 'x', language: 'de', topic: 'nominalisierung', source: 'Buch', createdAt: '2026-01-01',
    prompt: { source: 'Wenn …', words: [{ text: 'Wenn', meaning: 'if' }], hint: { de: 'alt', en: 'old' } },
    answer: { accepted: ['Bei …'], acceptable: [{ text: 'Beim …', note: { de: 'steif', en: 'stiff' } }] },
    meta: { form: 'x' },
  };
  const v = valuesFromCard(card);
  assert.equal(v.hint, 'alt');
  const c = cardFromValues({ ...v, hint: 'neu', accepted: 'Bei …\nIm Falle …' }, { lang: 'de', existing: card, newId, today });
  assert.deepEqual(c.prompt.words, card.prompt.words);
  assert.deepEqual(c.prompt.hint, { de: 'neu', en: 'old' }, 'other languages of a hint are kept');
  assert.deepEqual(c.answer.acceptable, card.answer.acceptable, 'other languages of a note are kept');
  assert.deepEqual(c.answer.accepted, ['Bei …', 'Im Falle …']);
  assert.deepEqual(c.meta, { form: 'x' });
  assert.equal(c.source, 'Buch');
  assert.equal(c.createdAt, '2026-01-01');
}

// ---------- ids ----------
{
  const taken = new Set(['de-nominalisierung-u0', 'de-nominalisierung-u1']);
  assert.equal(makeId('de', 'nominalisierung', (id) => taken.has(id), 0), 'de-nominalisierung-u2');
}

console.log(`ok - card form: new cards, required fields, flip, sentence, ${roundTrips} bundled cards survive an unchanged edit, ids`);
