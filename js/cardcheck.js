// Content checks for one card: the rules the app relies on to draw and judge it, beyond its shape.
// One place for them, used by tests/data.test.mjs (bundled cards), tools/validate.mjs (generated or
// hand-written files) and the importer. No DOM.
import { validateCard } from './store.js';
import { checkAnswer } from './check.js';
import { wordSegments, toSurface, toKana, hasNoReading, withoutNoReading } from './text.js';
import { LANGS, facetsOf, formsOf, typeOf, usesRuby, isRecall } from './topics.js';
import { sentenceOf, vocabCardFrom } from './cardtypes.js';

export const KANJI = /[一-鿿々]/;

/** Texts of a card written in the course's language (as opposed to meanings, notes and translations). */
export function targetTexts(card) {
  const p = card.prompt || {};
  const a = card.answer || {};
  const flip = typeOf(card) === 'flip';
  const recall = isRecall(typeOf(card)); // its answers are meanings or translations
  return [
    sentenceOf(card), p.base?.word, flip ? p.word : null,
    ...(recall ? [] : [...(a.accepted || []), ...(a.acceptable || []).map((x) => x.text), ...(a.mistakes || []).map((x) => x.text)]),
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

  // Form registry: a topic that has one names the form in meta.form, and the task is that form's label.
  const forms = formsOf(card.language, card.topic);
  if (Object.keys(forms).length && !isRecall(typeOf(card))) {
    const form = card.meta?.form;
    const task = card.prompt.task;
    const written = typeof task === 'string' ? task : task?.[LANGS[card.language].noteLang];
    if (form === undefined) out.push(`meta.form is missing (one of: ${Object.keys(forms).join(', ')})`);
    else if (!(form in forms)) out.push(`meta.form "${form}" is not one of: ${Object.keys(forms).join(', ')}`);
    else if (written !== forms[form]) out.push(`prompt.task ${written === undefined ? 'is missing' : `"${written}" is not the label of form "${form}"`}: it must be "${forms[form]}"`);
  }

  // Register: a known one, and set whenever an answer could be in either register.
  const L = LANGS[card.language];
  const reg = card.prompt.register;
  if (reg !== undefined && !(reg in L.registers)) out.push(`prompt.register "${reg}" is not one of: ${Object.keys(L.registers).join(', ') || '(none in this course)'}`);
  if (L.politeAnswer && !isRecall(typeOf(card))) {
    const polite = (x) => new RegExp(L.politeAnswer).test(toSurface(x).trim());
    const answers = [...a.accepted, ...(a.acceptable || []).map((x) => x.text)];
    if (reg === undefined && answers.some(polite)) out.push(`some answers are polite: set prompt.register (${Object.keys(L.registers).join(' or ')})`);
    if (reg === 'polite' && !a.accepted.every(polite)) out.push('prompt.register is "polite" but an accepted answer is not');
    if (reg === 'plain' && a.accepted.some(polite)) out.push('prompt.register is "plain" but an accepted answer is polite');
  }

  // Furigana: every kanji has a reading, or kana answers are not recognized.
  if (usesRuby(card.language)) {
    // The base word may leave a kanji without furigana on purpose ({人|-}); nothing else may.
    const base = card.prompt.base?.word;
    for (const x of targetTexts(card)) {
      if (x !== base && hasNoReading(x)) out.push(`{漢字|-} (no furigana) is only allowed in prompt.base.word: ${x}`);
      if (KANJI.test(toKana(x === base ? withoutNoReading(x) : x))) out.push(`kanji without furigana: ${x}`);
    }
  }
  return out;
}
