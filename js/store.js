// Card library (bundled files + imported cards), progress, study log and settings in localStorage.
import { dayIndex, normalize, DEFAULTS } from './srs.js';
import { LANGS, LANG_IDS, CARD_TYPES, topicOf, typeOf, deckIds } from './topics.js';
import { AUTHORING_FORMAT, authoringSchema, checkSchema, cardsFromAuthoring } from './authoring.js';
import { addAnswer, mergeLogs, onlyLang } from './studylog.js';

export const FORMAT = 'grammatik-kanpeki.cards';
export const VERSION = 2;

const K = {
  user: 'gk.userCards.v1',
  hidden: 'gk.hidden.v1',
  progress: 'gk.progress.v1',
  settings: 'gk.settings.v1',
  daily: 'gk.daily.v1',
  log: 'gk.studylog.v1',
};

function read(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
}
function write(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { console.warn('storage failed', e); }
}

/**
 * Bring a card from an older file version up to the current one. Version 1 had topic-specific
 * prompt fields; version 2 uses the same fields per card type (see js/cardtypes.js):
 *   prompt.verbalstil           → prompt.source
 *   prompt.verb + prompt.meaning → prompt.base { word, meaning, pos: '動詞' }
 *   prompt.formLabel            → prompt.task
 * Cards that are already current are returned unchanged.
 */
export function upgradeCard(c) {
  const p = c?.prompt;
  if (!p || typeof p !== 'object' || !('verbalstil' in p || 'verb' in p || 'formLabel' in p)) return c;
  const { verbalstil, verb, meaning, formLabel, ...rest } = p;
  const prompt = { ...rest };
  if (verbalstil !== undefined && prompt.source === undefined) prompt.source = verbalstil;
  if (verb !== undefined && !prompt.base) prompt.base = { word: verb, ...(meaning ? { meaning } : {}), pos: '動詞' };
  if (formLabel !== undefined && prompt.task === undefined) prompt.task = formLabel;
  return { ...c, prompt };
}

const bundled = new Map();
let userCards = read(K.user, {});
{
  // Cards saved by an older version of the app.
  let changed = false;
  for (const [id, c] of Object.entries(userCards)) {
    const u = upgradeCard(c);
    if (u !== c) { userCards[id] = u; changed = true; }
  }
  if (changed) write(K.user, userCards);
}
let hidden = new Set(read(K.hidden, []));
let progress = read(K.progress, {});
let studyLog = read(K.log, {});

// theme: 'system' | 'light' | 'dark'. explainLang: preferred explanation language per course.
// collapsed: sidebar topics whose sub-topics are folded away ("de/deklination").
// speech: per course { voice (voiceURI, '' = automatic), rate (unset = the course's default) }.
// weekStart: first day of the week in the study history heatmap, 1 = Monday, 0 = Sunday.
// guideFolded: chapters of the grammar guide that are folded away ("ja/verb-conjugation--te").
const DEFAULT_SETTINGS = {
  newPerDay: DEFAULTS.newPerDay, reviewsPerDay: DEFAULTS.reviewsPerDay, furigana: true, showForm: true,
  explainLang: { de: 'de', ja: 'zh-Hant' }, theme: 'system', collapsed: [], speech: {}, weekStart: 1, guideFolded: [],
};
function loadSettings() {
  const saved = read(K.settings, {});
  // Before courses had their own explanation language, one string applied to German.
  if (typeof saved.explainLang === 'string') saved.explainLang = { ...DEFAULT_SETTINGS.explainLang, de: saved.explainLang };
  return {
    ...DEFAULT_SETTINGS, ...saved,
    explainLang: { ...DEFAULT_SETTINGS.explainLang, ...saved.explainLang },
    speech: { ...saved.speech },
  };
}
let settings = loadSettings();

export async function loadBundled() {
  const man = await fetch('data/manifest.json', { cache: 'no-cache' }).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); });
  for (const file of man.files) {
    const data = await fetch(`data/${file}`, { cache: 'no-cache' }).then((r) => r.json());
    for (const c of data.cards || []) bundled.set(c.id, upgradeCard(c));
  }
}

// ---------- cards ----------

export function allCards() {
  const map = new Map(bundled);
  for (const [id, c] of Object.entries(userCards)) map.set(id, c);
  return [...map.values()].filter((c) => !hidden.has(c.id));
}

/** Cards of a deck: the topic and all its sub-topics. */
export function cardsFor(lang, topic) {
  const ids = new Set(deckIds(lang, topic));
  return allCards().filter((c) => c.language === lang && ids.has(c.topic));
}
export const getCard = (id) => (hidden.has(id) ? null : userCards[id] || bundled.get(id) || null);

/** Demo sources: "demo", "demo2", "demo3", "demo1.5", …, optionally with a suffix: "demo-n5", "demo2-b1".
 *  Not "demographie", "demo1." or "demo.5". */
export const isDemoSource = (source) => /^demo(\d+(\.\d+)?)?(-[\w-]+)?$/.test(source || '');

/** A demo card ships with the app with a demo source. It stays one after the user edits it;
 *  cards the user adds, imports or saves from a word list do not count, even if copied from a demo card. */
export const isDemo = (card) => !!card && isDemoSource(bundled.get(card.id)?.source);

export function saveCard(card) {
  userCards[card.id] = card;
  hidden.delete(card.id);
  write(K.user, userCards);
  write(K.hidden, [...hidden]);
}

export function deleteCard(id) {
  delete userCards[id];
  if (bundled.has(id)) hidden.add(id);
  delete progress[id];
  write(K.user, userCards);
  write(K.hidden, [...hidden]);
  write(K.progress, progress);
}

export function hiddenFor(lang, topic) {
  const ids = new Set(deckIds(lang, topic));
  return [...hidden].filter((id) => { const c = bundled.get(id); return c && c.language === lang && ids.has(c.topic); });
}
export function restoreHidden(lang, topic) {
  for (const id of hiddenFor(lang, topic)) hidden.delete(id);
  write(K.hidden, [...hidden]);
}

/** Add the learner's own answer to a card as accepted / acceptable. */
export function addAlternative(id, text, kind, note) {
  const card = structuredClone(getCard(id));
  if (!card) return null;
  card.answer = card.answer || { accepted: [] };
  if (kind === 'accepted') {
    if (!card.answer.accepted.includes(text)) card.answer.accepted.push(text);
  } else {
    card.answer.acceptable = card.answer.acceptable || [];
    card.answer.acceptable.push(note ? { text, note } : { text });
  }
  card.updatedAt = new Date().toISOString().slice(0, 10);
  saveCard(card);
  return card;
}

// ---------- progress ----------

export const getProgress = (id) => normalize(progress[id]);
export function setProgress(id, state) { progress[id] = state; write(K.progress, progress); }
export function resetProgress(ids) { for (const id of ids) delete progress[id]; write(K.progress, progress); }

/** Cards answered today per topic: kind = 'new' (first answer) | 'review' (answers to review cards). */
export function dailyCount(lang, topic, kind) {
  const d = read(K.daily, {});
  return d.day === dayIndex() ? d[`${lang}/${topic}`]?.[kind] || 0 : 0;
}
export function bumpDaily(lang, topic, kind) {
  let d = read(K.daily, {});
  if (d.day !== dayIndex()) d = { day: dayIndex() };
  const k = `${lang}/${topic}`;
  d[k] = { new: 0, review: 0, ...(typeof d[k] === 'object' ? d[k] : {}) };
  d[k][kind] += 1;
  write(K.daily, d);
}

// ---------- study log (streak, heatmap; see js/studylog.js) ----------

export const getStudyLog = () => studyLog;
/** Count one graded answer for today's study day. */
export function logAnswer({ lang, isNew = false, again = false, now = Date.now() }) {
  studyLog = addAnswer(studyLog, { day: dayIndex(now), lang, isNew, again });
  write(K.log, studyLog);
}

// ---------- settings ----------

export const getSettings = () => settings;
export function setSettings(patch) { settings = { ...settings, ...patch }; write(K.settings, settings); }

// ---------- import / export ----------

export function buildExport({ lang = null, topic = null, includeProgress = false } = {}) {
  const cards = topic ? cardsFor(lang, topic) : allCards().filter((c) => !lang || c.language === lang);
  const out = { format: FORMAT, version: VERSION, exportedAt: new Date().toISOString(), cards };
  if (includeProgress) {
    out.progress = {};
    for (const c of cards) if (progress[c.id]) out.progress[c.id] = progress[c.id];
    // The study log is per course, not per topic: an export of one topic carries its course's log.
    out.studyLog = lang ? onlyLang(studyLog, lang) : studyLog;
  }
  return out;
}

/** Problems with a (current-version) card, as a list of messages. */
export function validateCard(c) {
  const errs = [];
  if (!c || typeof c !== 'object') return ['not an object'];
  if (!c.id || typeof c.id !== 'string') errs.push('id missing');
  if (!LANG_IDS.includes(c.language)) errs.push(`language must be one of ${LANG_IDS.map((x) => `"${x}"`).join(', ')}`);
  if (!c.topic) errs.push('topic missing');
  else if (LANGS[c.language] && !topicOf(c.language, c.topic)) errs.push(`unknown topic "${c.topic}"`);
  if (!c.prompt || typeof c.prompt !== 'object') errs.push('prompt missing');
  if (!Array.isArray(c.answer?.accepted) || !c.answer.accepted.length) errs.push('answer.accepted must be a non-empty list');
  if (c.type !== undefined && !CARD_TYPES.includes(c.type)) errs.push(`type must be one of ${CARD_TYPES.join(', ')}`);
  const type = typeOf(c);
  const p = c.prompt || {};
  if (type === 'rewrite' && !p.source) errs.push('prompt.source missing');
  if (type === 'cloze' && !p.sentence) errs.push('prompt.sentence missing');
  if (type === 'cloze' && p.sentence && String(p.sentence).split('___').length !== 2) errs.push('prompt.sentence needs exactly one ___');
  if (type === 'flip' && !p.word) errs.push('prompt.word missing');
  if (p.words !== undefined && !Array.isArray(p.words)) errs.push('prompt.words must be a list');
  return errs;
}

/** Parse an import file. Accepts the full format, a bare array of cards, or an authoring file (js/authoring.js). */
export function parseImport(text, fileName = 'import') {
  let data;
  try { data = JSON.parse(text); } catch (e) { return { error: `JSON: ${e.message}` }; }
  let list = Array.isArray(data) ? data : data?.cards;
  if (!Array.isArray(list)) return { error: 'no "cards" list found' };
  const cards = [];
  const invalid = [];
  if (data.format === AUTHORING_FORMAT) {
    if (!topicOf(data.language, data.topic)) return { error: `unknown topic "${data.language}/${data.topic}"` };
    const schema = authoringSchema(data.language, data.topic).properties.cards.items;
    const ok = [];
    list.forEach((c, i) => {
      const errs = checkSchema(schema, c);
      if (errs.length) invalid.push(`#${i + 1}: ${errs.join('; ')}`);
      else ok.push(c);
    });
    list = cardsFromAuthoring({ ...data, cards: ok, source: data.source || `import:${fileName}` });
  }
  list.forEach((raw, i) => {
    const c = upgradeCard(raw);
    const errs = validateCard(c);
    if (errs.length) invalid.push(`#${i + 1} ${c?.id ?? ''}: ${errs.join(', ')}`);
    else cards.push(c.source ? c : { ...c, source: `import:${fileName}` });
  });
  const existing = cards.filter((c) => getCard(c.id) || bundled.has(c.id)).length;
  return { cards, invalid, existing, fresh: cards.length - existing, progress: Array.isArray(data) ? null : data.progress || null, studyLog: Array.isArray(data) ? null : data.studyLog || null };
}

export function applyImport(parsed, { overwrite }) {
  let added = 0;
  let updated = 0;
  let skipped = 0;
  for (const c of parsed.cards) {
    const exists = !!(userCards[c.id] || bundled.has(c.id));
    if (exists && !overwrite && !hidden.has(c.id)) { skipped++; continue; }
    userCards[c.id] = c;
    hidden.delete(c.id);
    exists ? updated++ : added++;
  }
  let progressCount = 0;
  if (parsed.progress) {
    for (const [id, st] of Object.entries(parsed.progress)) {
      if (parsed.cards.some((c) => c.id === id) && (overwrite || !progress[id])) { progress[id] = st; progressCount++; }
    }
  }
  // Merging keeps the larger count per day, so the log is never lowered, with or without overwrite.
  let logDays = 0;
  if (parsed.studyLog) {
    const m = mergeLogs(studyLog, parsed.studyLog);
    studyLog = m.log;
    logDays = m.days;
  }
  write(K.user, userCards);
  write(K.hidden, [...hidden]);
  write(K.progress, progress);
  write(K.log, studyLog);
  return { added, updated, skipped, progressCount, logDays };
}
