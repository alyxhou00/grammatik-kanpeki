// Content checks for one card: the rules the app relies on to draw and judge it, beyond its shape.
// One place for them, used by tests/data.test.mjs (bundled cards), tools/validate.mjs (generated or
// hand-written files) and the importer. No DOM.
import { validateCard } from './store.js';
import { checkAnswer } from './check.js';
import { wordSegments, toSurface, toKana } from './text.js';
import { facetsOf, typeOf, usesRuby } from './topics.js';
import { sentenceOf, vocabCardFrom } from './cardtypes.js';

export const KANJI = /[一-鿿々]/;

/** Texts of a card written in the course's language (as opposed to meanings, notes and translations). */
export function targetTexts(card) {
  const p = card.prompt || {};
  const a = card.answer || {};
  const flip = typeOf(card) === 'flip';
  return [
    sentenceOf(card), p.base?.word, flip ? p.word : null,
    ...(flip ? [] : [...(a.accepted || []), ...(a.acceptable || []).map((x) => x.text), ...(a.mistakes || []).map((x) => x.text)]),
    ...(p.words || []).flatMap((w) => [w.text, w.lemma]),
  ].filter(Boolean);
}

/** Every problem with a card, as messages. An empty list means the card is fine. */
export function cardProblems(card) {
  const shape = validateCard(card);
  if (shape.length) return shape; // the content checks below assume a well-formed card
  const out = [];
  const a = card.answer;

  // Every answer list is judged the way the card says.
  const expect = (list, verdict, label) => {
    for (const text of list) {
      const got = checkAnswer(card, toSurface(text)).verdict;
      if (got !== verdict) out.push(`${label} "${text}" is judged "${got}", not "${verdict}"`);
    }
  };
  expect(a.accepted, 'correct', 'accepted answer');
  expect((a.acceptable || []).map((x) => x.text), 'acceptable', '"correct but not ideal" answer');
  expect((a.mistakes || []).map((x) => x.text), 'mistake', 'mistake');

  // Hoverable words: each is found in the sentence, in order, with a meaning and a part of speech,
  // and saving it gives a valid word-list card.
  const words = card.prompt.words || [];
  const found = wordSegments(sentenceOf(card) || '', words).filter((s) => s.word).length;
  if (found !== words.length) out.push(`only ${found} of ${words.length} words are found in the sentence (in order, as whole words)`);
  for (const w of words) {
    if (!w.meaning || !w.pos) out.push(`word "${w.text}" needs a meaning and a part of speech`);
    else for (const e of validateCard(vocabCardFrom({ lemma: w.lemma || w.text, meaning: w.meaning, pos: w.pos }, card, card.language))) out.push(`saving word "${w.text}": ${e}`);
  }

  // Facet values are ones the topic knows.
  for (const [key, names] of Object.entries(facetsOf(card.language, card.topic))) {
    const v = card.meta?.[key];
    if (v !== undefined && !(v in names)) out.push(`meta.${key} "${v}" is not one of: ${Object.keys(names).join(', ')}`);
  }

  // Furigana: every kanji has a reading, or kana answers are not recognized.
  if (usesRuby(card.language)) {
    for (const x of targetTexts(card)) if (KANJI.test(toKana(x))) out.push(`kanji without furigana: ${x}`);
  }
  return out;
}
