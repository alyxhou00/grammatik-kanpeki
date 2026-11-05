// Authoring format: what a person or an LLM writes to make new cards for one topic.
//
// A full card file (grammatik-kanpeki.cards, schema/cards.schema.json) carries an id, the course, the
// topic and dates on every card, and allows the fields of every card type. An authoring file names the
// course and topic once and holds only what an author decides:
//
//   {
//     "format": "grammatik-kanpeki.authoring",
//     "language": "ja", "topic": "verb-conjugation",
//     "source": "Claude, 2026-11",                       (optional: where the cards come from)
//     "cards": [ { "prompt": {…}, "answer": {…}, "explanation": {…}, "meta": {…}, "level": "N5", "tags": […] } ]
//   }
//
// Its JSON Schema is built from the topic's entry in js/topics.js (card type, facets, labels, about,
// the course's languages), so adding or changing a topic needs nothing here. No DOM.
import { LANGS, topicOf, topicType, facetsOf, formsOf, labelsOf, inherited, usesRuby } from './topics.js';
import { toSurface, shortHash } from './text.js';

export const AUTHORING_FORMAT = 'grammatik-kanpeki.authoring';

const LANG_NAMES = { de: 'German', en: 'English', 'zh-Hant': 'Traditional Chinese', ja: 'Japanese' };
const nameOf = (code) => LANG_NAMES[code] || code;

// Strings that may only contain kanji inside furigana markup {漢字|かんじ}.
const RUBY_PATTERN = '^(?:\\{[^|{}]+\\|[^{}]+\\}|[^{}\\u4e00-\\u9fff\\u3005])*$';
const RUBY_RULE = 'every kanji needs its reading in furigana markup, e.g. {食|た}べる, {朝|あさ}ごはん';
// Exactly one ___ (three underscores).
const BLANK_PATTERN = '^(?:(?!___)[\\s\\S])*___(?:(?!___)[\\s\\S])*$';
const BLANK_RULE = 'needs exactly one blank, written ___ (three underscores)';

// ---------- schema building blocks ----------

const str = (description, extra = {}) => ({ type: 'string', minLength: 1, ...(description ? { description } : {}), ...extra });
function obj(properties, required = [], description, extra = {}) {
  return {
    type: 'object', ...(description ? { description } : {}), properties,
    ...(required.length ? { required } : {}), additionalProperties: false, ...extra,
  };
}
const list = (items, description, extra = {}) => ({ type: 'array', ...(description ? { description } : {}), items, ...extra });

/** The JSON Schema of an authoring file for one topic. */
export function authoringSchema(lang, topicId) {
  const L = LANGS[lang];
  const tp = topicOf(lang, topicId);
  if (!L || !tp) throw new Error(`unknown topic ${lang}/${topicId}`);
  const type = topicType(lang, topicId);
  const labels = labelsOf(lang, topicId);
  const facets = facetsOf(lang, topicId);
  const formNames = formsOf(lang, topicId);
  const forms = Object.keys(formNames).length && type !== 'flip' ? formNames : null;
  const ruby = usesRuby(lang);
  const note = nameOf(L.noteLang);
  const course = nameOf(lang);

  /** Text in the course's language (sentences, answers, words). */
  const text = (description, extra = {}) => (ruby
    ? str(`${description} Write every kanji with its reading: {漢字|かんじ}.`, { pattern: RUBY_PATTERN, 'x-rule': RUBY_RULE, ...extra })
    : str(description, extra));
  const localized = (langs, description, required = []) => obj(
    Object.fromEntries(langs.map((k) => [k, str(nameOf(k))])), required, description, { minProperties: 1 },
  );
  const trLangs = L.explainLangs.map(([k]) => k).filter((k) => k !== lang);
  const trAlways = L.translation === 'always';
  const translation = (what) => localized(trLangs, trAlways
    ? `Translation of ${what}. ${nameOf(L.noteLang)} is shown with it right away and should always be given.`
    : `Translation of ${what}. Each language is hidden behind a click; give the ones you can.`, trAlways ? [L.noteLang] : []);

  const word = obj({
    text: text(`The word exactly as it is written in the sentence${ruby ? ' (with the same furigana markup)' : ''}.`),
    lemma: text('Dictionary form, only if it differs from text. This is what gets saved to the word list.'),
    meaning: str(`Meaning in ${note}, as short as possible.`),
    pos: str(`Part of speech in ${note}.`),
  }, ['text', 'meaning', 'pos']);
  const words = (where) => list(word, `Optional: words in ${where} a learner may not know. They can hover them to see the meaning and save them to their word list. In the order they appear, each written exactly as in ${where}; a word is matched as a whole word only.`);
  const task = forms
    ? str(`Leave it out: it is filled in from meta.form (the topic's registry of labels), and any value given here is replaced.`)
    : str(`What to produce, shown as a chip, in ${note}${type === 'cloze' ? ', e.g. the target form or case' : ''}. Optional.`);
  const hint = str(`A tip, hidden until clicked, in ${note}. Optional.`);
  const regs = Object.entries(L.registers);
  // Spread into a prompt's properties: nothing in a course without registers.
  const register = regs.length ? {
    register: {
      enum: regs.map(([k]) => k),
      description: `Which register the answer is in, shown as its own label beside the task: ${regs.map(([k, n]) => `${k} (${n})`).join(', ')}. Set it whenever the answer could be written in either register; then the task does not say it again, and the answer in the other register goes into acceptable with a note. Leave it out when the answer looks the same in both (a form inside a fixed pattern, e.g. the te-form before ください).`,
    },
  } : {};

  let prompt;
  if (type === 'rewrite') {
    prompt = obj({
      source: text(`The sentence to rewrite (${labels.source || 'source sentence'}).`),
      task, ...register, hint, translation: translation('the sentence'), words: words('source'),
    }, ['source'], `What the learner sees: a ${course} sentence to rewrite as ${labels.target || 'the target form'}.`);
  } else if (type === 'cloze') {
    prompt = obj({
      sentence: str(`The ${course} sentence with the gap written as ___.${ruby ? ' Write every kanji with its reading: {漢字|かんじ}.' : ''}`, {
        allOf: [{ pattern: BLANK_PATTERN, 'x-rule': BLANK_RULE }, ...(ruby ? [{ pattern: RUBY_PATTERN, 'x-rule': RUBY_RULE }] : [])],
      }),
      base: obj({
        word: text(`The word to start from, in its dictionary form (${labels.base || 'base form'}).`),
        meaning: str(`Its meaning in ${note}.`),
        pos: str(`Its part of speech in ${note}.`),
      }, ['word'], 'Optional: the word the answer is formed from, shown above the sentence.'),
      task, ...register, hint, translation: translation('the full sentence (with the gap filled)'), words: words('sentence'),
    }, ['sentence'], `What the learner sees: a ${course} sentence with one gap to fill.`);
  } else {
    prompt = obj({
      word: text(`The ${course} word or phrase, in its dictionary form. Shown on the front.`),
      pos: str(`Part of speech in ${note}.`),
      example: text(`A ${course} sentence that uses the word.`),
      exampleTranslation: translation('the example sentence'),
      words: words('example'),
    }, ['word'], 'What the learner sees: one word; they recall its meaning and grade themselves.');
  }

  const withNote = (what) => obj({
    text: text(`The ${what} answer, written like the accepted ones.`),
    note: str(`Why, in ${note}, shown to the learner.`),
  }, ['text', 'note']);
  const answer = type === 'flip'
    ? obj({
      accepted: list(str(`A meaning in ${note}.`), 'The meaning(s) of the word, the main one first.', { minItems: 1 }),
    }, ['accepted'])
    : obj({
      accepted: list(text('A fully correct answer.'), `Every fully correct answer${type === 'rewrite' ? ` (${labels.target || 'the rewritten sentence'})` : ''}, the most natural one first. A typed answer counts as correct when it matches one of these${ruby ? ' in kanji or in kana' : ''}${L.nearMatch ? '; a near miss (wrong capitalisation, a word off) is only "almost right"' : ''}.`, { minItems: 1 }),
      acceptable: list(withNote('correct but not ideal'), 'Optional: answers that are correct but clumsy, too colloquial, or not what the task asks for. Each with a note why.'),
      mistakes: list(withNote('typical wrong'), 'Optional: typical wrong answers learners give, each with a note that explains the mistake. Must not match an accepted answer.'),
    }, ['accepted'], 'How a typed answer is judged.');

  // Facets name a card's classes; the form registry names the one form the card practises.
  const metaKeys = { ...facets, ...(forms ? { form: formNames } : {}) };
  const meta = Object.keys(metaKeys).length
    ? obj(
      Object.fromEntries(Object.entries(metaKeys).map(([k, names]) => [k, {
        enum: Object.keys(names),
        description: k === 'form' && forms
          ? `The form this card practises. Its label becomes the task shown to the learner. One of: ${Object.entries(names).map(([v, n]) => `${v} (${n})`).join(', ')}. If the right one is missing, do not invent a label: use the closest and say so in source.`
          : `One of: ${Object.entries(names).map(([v, n]) => `${v} (${n})`).join(', ')}.`,
      }])),
      Object.keys(metaKeys),
      'Classification of the card, shown as chips after answering.',
      { additionalProperties: { type: 'string' } },
    )
    : { type: 'object', description: 'Optional labels for filtering, e.g. { "form": "nai" }.', additionalProperties: { type: 'string' } };

  const card = obj({
    prompt,
    answer,
    explanation: localized(L.explainLangs.map(([k]) => k), `Why the answer is what it is, shown after answering. ${note} first; other languages optional.`),
    meta,
    level: str(`Level, e.g. ${L.level}.`),
    tags: list(str(), 'Optional keywords for search, e.g. the grammar point.'),
  }, ['prompt', 'answer'].concat(Object.keys(metaKeys).length ? ['meta'] : []));

  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: `grammatik-kanpeki.authoring/${lang}/${topicId}`,
    title: `New cards: ${tp.label.replace(/­/g, '')} (${L.label})`,
    description: [inherited(lang, topicId, 'about'), `Notes, hints, tasks and meanings are in ${note}.`].filter(Boolean).join(' '),
    type: 'object',
    properties: {
      format: { const: AUTHORING_FORMAT },
      language: { const: lang },
      topic: { const: topicId },
      source: str('Optional: where the cards come from, e.g. a book, a URL, or the model that wrote them.'),
      cards: list(card, 'The new cards.', { minItems: 1 }),
    },
    required: ['format', 'language', 'topic', 'cards'],
    additionalProperties: false,
  };
}

// ---------- checking a value against a schema ----------

const typeName = (v) => (Array.isArray(v) ? 'array' : v === null ? 'null' : typeof v);

/**
 * Check a value against the subset of JSON Schema the authoring schemas use (type, const, enum,
 * required, properties, additionalProperties, items, minItems, minLength, minProperties, pattern,
 * allOf). Returns messages like 'cards[2].prompt.sentence: needs exactly one blank …'.
 */
export function checkSchema(schema, value, path = '') {
  const out = [];
  const err = (m) => out.push(`${path || '(file)'}: ${m}`);
  for (const sub of schema.allOf || []) out.push(...checkSchema(sub, value, path));
  if ('const' in schema && value !== schema.const) { err(`must be ${JSON.stringify(schema.const)}`); return out; }
  if (schema.enum && !schema.enum.includes(value)) { err(`must be one of ${schema.enum.map((x) => JSON.stringify(x)).join(', ')}`); return out; }
  if (schema.type && typeName(value) !== schema.type) { err(`must be ${schema.type === 'array' || schema.type === 'object' ? 'an' : 'a'} ${schema.type}`); return out; }
  if (typeof value === 'string') {
    if (schema.minLength && value.trim().length < schema.minLength) err('must not be empty');
    else if (schema.pattern && !new RegExp(schema.pattern, 'u').test(value)) err(schema['x-rule'] || `must match ${schema.pattern}`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems && value.length < schema.minItems) err(`needs at least ${schema.minItems} item${schema.minItems === 1 ? '' : 's'}`);
    if (schema.items) value.forEach((x, i) => out.push(...checkSchema(schema.items, x, `${path}[${i}]`)));
  }
  if (typeName(value) === 'object') {
    const props = schema.properties || {};
    for (const k of schema.required || []) if (!(k in value)) err(`"${k}" is missing`);
    if (schema.minProperties && Object.keys(value).length < schema.minProperties) err('must not be empty');
    for (const [k, v] of Object.entries(value)) {
      const at = path ? `${path}.${k}` : k;
      if (props[k]) out.push(...checkSchema(props[k], v, at));
      else if (schema.additionalProperties === false) out.push(`${at}: unknown field (allowed here: ${Object.keys(props).join(', ')})`);
      else if (schema.additionalProperties && typeof schema.additionalProperties === 'object') out.push(...checkSchema(schema.additionalProperties, v, at));
    }
  }
  return out;
}

// ---------- authoring cards ↔ full cards ----------

const mainText = (type, p) => (type === 'rewrite' ? p.source : type === 'cloze' ? p.sentence : p.word);

/**
 * Full cards from an authoring file (assumed to pass its schema). The id comes from the card's main
 * text and first answer, so importing the same generated card twice updates it instead of doubling it.
 */
export function cardsFromAuthoring(file, { today = new Date().toLocaleDateString('sv-SE') } = {}) {
  const { language: lang, topic } = file;
  const type = topicType(lang, topic);
  const forms = formsOf(lang, topic);
  const used = new Set();
  return file.cards.map((c) => {
    // The registry decides the task: the author names the form, not its label.
    const label = forms[c.meta?.form];
    const prompt = label ? { ...c.prompt, task: label } : c.prompt;
    const base = `${lang}-${topic}-g${shortHash(`${toSurface(mainText(type, c.prompt))}|${toSurface(c.answer.accepted[0])}`)}`;
    let id = base;
    for (let n = 2; used.has(id); n++) id = `${base}-${n}`;
    used.add(id);
    const card = {
      id, language: lang, topic, source: file.source || 'generated',
      level: c.level, tags: c.tags, createdAt: today, meta: c.meta,
      prompt, answer: c.answer, explanation: c.explanation,
    };
    return Object.fromEntries(Object.entries(card).filter(([, v]) => v !== undefined));
  });
}

/** A full card in authoring form: what an author writes (used for examples). */
export function toAuthoring(card) {
  const L = LANGS[card.language];
  const asObj = (v) => (typeof v === 'string' ? { [L.noteLang]: v } : v);
  const asStr = (v) => (v && typeof v === 'object' ? v[L.noteLang] || Object.values(v)[0] : v);
  const p = { ...card.prompt };
  for (const k of ['translation', 'exampleTranslation']) if (p[k] !== undefined) p[k] = asObj(p[k]);
  for (const k of ['task', 'hint']) if (p[k] !== undefined) p[k] = asStr(p[k]);
  // A task that is just the registry's label is not written out: importing fills it in again.
  if (p.task !== undefined && p.task === formsOf(card.language, card.topic)[card.meta?.form]) delete p.task;
  const rows = (xs) => xs?.map((x) => ({ text: x.text, note: asStr(x.note) || '' }));
  const answer = Object.fromEntries(Object.entries({
    accepted: card.answer.accepted, acceptable: rows(card.answer.acceptable), mistakes: rows(card.answer.mistakes),
  }).filter(([, v]) => v !== undefined));
  const { savedFrom, sense, ...meta } = card.meta || {};
  const out = {
    prompt: p, answer, explanation: card.explanation === undefined ? undefined : asObj(card.explanation),
    meta: Object.keys(meta).length ? meta : undefined, level: card.level, tags: card.tags?.length ? card.tags : undefined,
  };
  return Object.fromEntries(Object.entries(out).filter(([, v]) => v !== undefined));
}
