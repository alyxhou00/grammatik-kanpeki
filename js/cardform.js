// The "add / edit card" form as data: card → form values and form values → card.
// No DOM, so it can be tested with node. The dialog itself is drawn in js/app.js.
//
// Form values (all strings unless noted):
//   topic
//   source | sentence | word        the type's main field (rewrite | cloze | flip)
//   baseWord, baseMeaning, basePos  cloze: optional word to start from
//   pos, example                    flip: part of speech and example sentence
//   task, hint                      prompt.task, prompt.hint (in the course's note language)
//   accepted                        one answer per line (flip: one meaning per line)
//   acceptable, mistakes            [{ text, note }]
//   translation, explanation        { [lang]: text }  (flip: translation is the example's)
//   meta                            { [facet]: value }
//   level, tags (comma separated), cardSource
//
// Editing keeps every field the form does not show (prompt.words, meta.form, createdAt, …).
import { LANGS, topicType, facetsOf } from './topics.js';
import { BLANK, toKana, isRomaji, romajiToHiragana } from './text.js';

const KANJI = /[一-鿿々]/;
export const USER_SOURCE = 'user';

/** Languages a course offers for translations (the card's own language is left out) and explanations. */
export function formLangs(lang) {
  const all = LANGS[lang].explainLangs.map(([k]) => k);
  return { translation: all.filter((k) => k !== lang), explanation: all };
}

/** Localized value → { [lang]: text }. A plain string belongs to the course's note language. */
function locObj(v, lang) {
  if (v == null || v === '') return {};
  return typeof v === 'string' ? { [LANGS[lang].noteLang]: v } : { ...v };
}

/** { [lang]: text } → the most compact localized value, or undefined when empty. */
function compactLoc(obj) {
  const out = Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, String(v ?? '').trim()]).filter(([, v]) => v));
  return Object.keys(out).length ? out : undefined;
}

const lines = (s) => String(s ?? '').split('\n').map((x) => x.trim()).filter(Boolean);

/** Empty form for a topic. */
export function emptyValues(lang, topic) {
  return {
    topic, source: '', sentence: '', word: '', baseWord: '', baseMeaning: '', basePos: '', pos: '', example: '',
    task: '', hint: '', accepted: '', acceptable: [], mistakes: [], translation: {}, explanation: {}, meta: {},
    level: '', tags: '', cardSource: '',
  };
}

/** A card as form values. */
export function valuesFromCard(card) {
  const lang = card.language;
  const p = card.prompt || {};
  const a = card.answer || {};
  const flip = (card.type || topicType(lang, card.topic)) === 'flip';
  const noteLang = LANGS[lang].noteLang;
  return {
    ...emptyValues(lang, card.topic),
    source: p.source || '',
    sentence: p.sentence || '',
    word: p.word || '',
    baseWord: p.base?.word || '',
    baseMeaning: p.base?.meaning || '',
    basePos: p.base?.pos || '',
    pos: p.pos || '',
    example: p.example || '',
    task: locObj(p.task, lang)[noteLang] || '',
    hint: locObj(p.hint, lang)[noteLang] || '',
    accepted: (a.accepted || []).join('\n'),
    acceptable: (a.acceptable || []).map((x) => ({ text: x.text, note: locObj(x.note, lang)[noteLang] || '' })),
    mistakes: (a.mistakes || []).map((x) => ({ text: x.text, note: locObj(x.note, lang)[noteLang] || '' })),
    translation: locObj(flip ? p.exampleTranslation : p.translation, lang),
    explanation: locObj(card.explanation, lang),
    meta: { ...(card.meta || {}) },
    level: card.level || '',
    tags: (card.tags || []).join(', '),
    cardSource: card.source === USER_SOURCE ? '' : card.source || '',
  };
}

/** Problems that block saving, as { field: messageKey }. */
export function formErrors(values, lang) {
  const type = topicType(lang, values.topic);
  const errs = {};
  const main = type === 'rewrite' ? 'source' : type === 'cloze' ? 'sentence' : 'word';
  if (!values[main]?.trim()) errs[main] = 'required';
  else if (type === 'cloze' && values.sentence.split(BLANK).length !== 2) errs.sentence = 'blank';
  if (!lines(values.accepted).length) errs.accepted = 'required';
  return errs;
}

/** Text with kanji but no furigana (courses with `ruby`): it shows without readings, and kana answers are not recognized. */
export function missingFurigana(values, lang) {
  if (!LANGS[lang].ruby) return [];
  const texts = [values.sentence, values.word, values.baseWord, values.example, ...lines(values.accepted)];
  return texts.filter((x) => x && KANJI.test(toKana(x)));
}

/** Answers typed in romaji (courses with `romajiInput`) are stored as hiragana, the way the learner's own saved answers are. */
const answerText = (s, lang) => {
  const v = String(s ?? '').trim();
  return LANGS[lang].romajiInput && isRomaji(v) ? romajiToHiragana(v) : v;
};

/** Answer rows with notes. A note the edited card had in other languages keeps those languages. */
function withNotes(rows, lang, oldRows = []) {
  const noteLang = LANGS[lang].noteLang;
  const out = rows
    .map((r) => ({ text: answerText(r.text, lang), note: String(r.note ?? '').trim() }))
    .filter((r) => r.text)
    .map((r) => {
      const old = oldRows.find((x) => x.text === r.text)?.note;
      const note = typeof old === 'object' && old ? compactLoc({ ...old, [noteLang]: r.note }) : r.note || undefined;
      return note ? { text: r.text, note } : { text: r.text };
    });
  return out.length ? out : undefined;
}

function setOrDelete(obj, key, value) {
  const empty = value === undefined || value === '' || (Array.isArray(value) && !value.length)
    || (value && typeof value === 'object' && !Array.isArray(value) && !Object.keys(value).length);
  if (empty) delete obj[key];
  else obj[key] = value;
}

/**
 * Build a card from form values. `existing` is the card being edited (its other fields are kept);
 * `newId` makes the id for a new card.
 */
export function cardFromValues(values, { lang, existing = null, newId, today = new Date().toLocaleDateString('sv-SE') }) {
  const card = existing ? structuredClone(existing) : { id: newId(lang, values.topic), language: lang, createdAt: today };
  const type = card.type || topicType(lang, values.topic);
  const noteLang = LANGS[lang].noteLang;
  card.topic = values.topic;
  card.source = values.cardSource.trim() || USER_SOURCE;
  setOrDelete(card, 'level', values.level.trim());
  setOrDelete(card, 'tags', values.tags.split(/[,，、]/).map((x) => x.trim()).filter(Boolean));

  const p = { ...(card.prompt || {}) };
  // Fields of other card types do not belong on this one (the topic may have changed).
  for (const k of ['source', 'sentence', 'base', 'word', 'pos', 'example', 'exampleTranslation']) delete p[k];
  if (type === 'rewrite') p.source = values.source.trim();
  if (type === 'cloze') {
    p.sentence = values.sentence.trim();
    const base = { word: values.baseWord.trim(), meaning: values.baseMeaning.trim(), pos: values.basePos.trim() };
    if (base.word) p.base = Object.fromEntries(Object.entries(base).filter(([, v]) => v));
  }
  if (type === 'flip') {
    p.word = values.word.trim();
    setOrDelete(p, 'pos', values.pos.trim());
    setOrDelete(p, 'example', values.example.trim());
  }
  const keepOthers = (old, text) => compactLoc({ ...locObj(old, lang), [noteLang]: text });
  setOrDelete(p, 'task', keepOthers(existing?.prompt?.task, values.task));
  setOrDelete(p, 'hint', keepOthers(existing?.prompt?.hint, values.hint));
  const tr = compactLoc(values.translation);
  if (type === 'flip') {
    delete p.translation;
    if (p.example) setOrDelete(p, 'exampleTranslation', tr);
  } else {
    setOrDelete(p, 'translation', tr);
  }
  card.prompt = p;

  card.answer = { accepted: lines(values.accepted).map((x) => answerText(x, lang)) };
  setOrDelete(card.answer, 'acceptable', withNotes(values.acceptable, lang, existing?.answer?.acceptable));
  if (type !== 'flip') setOrDelete(card.answer, 'mistakes', withNotes(values.mistakes, lang, existing?.answer?.mistakes));

  setOrDelete(card, 'explanation', compactLoc(values.explanation));

  const meta = { ...(card.meta || {}) };
  for (const key of Object.keys(facetsOf(lang, values.topic))) setOrDelete(meta, key, values.meta[key] || '');
  setOrDelete(card, 'meta', meta);

  if (existing) card.updatedAt = today;
  return card;
}

/** A new, unused id such as "ja-particles-u1a2b3c". */
export function makeId(lang, topic, exists, now = Date.now()) {
  let n = now;
  let id;
  do id = `${lang}-${topic}-u${(n++).toString(36)}`; while (exists(id));
  return id;
}
