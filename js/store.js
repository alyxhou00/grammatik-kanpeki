// Card library (bundled files + imported cards), progress and settings in localStorage.
import { dayIndex, normalize, DEFAULTS } from './srs.js';

export const FORMAT = 'grammatik-kanpeki.cards';
export const VERSION = 1;

const K = {
  user: 'gk.userCards.v1',
  hidden: 'gk.hidden.v1',
  progress: 'gk.progress.v1',
  settings: 'gk.settings.v1',
  daily: 'gk.daily.v1',
};

function read(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
}
function write(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { console.warn('storage failed', e); }
}

const bundled = new Map();
let userCards = read(K.user, {});
let hidden = new Set(read(K.hidden, []));
let progress = read(K.progress, {});

const DEFAULT_SETTINGS = { newPerDay: DEFAULTS.newPerDay, reviewsPerDay: DEFAULTS.reviewsPerDay, furigana: true, showForm: true, explainLang: 'de' };
let settings = { ...DEFAULT_SETTINGS, ...read(K.settings, {}) };

export async function loadBundled() {
  const man = await fetch('data/manifest.json', { cache: 'no-cache' }).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); });
  for (const file of man.files) {
    const data = await fetch(`data/${file}`, { cache: 'no-cache' }).then((r) => r.json());
    for (const c of data.cards || []) bundled.set(c.id, c);
  }
}

// ---------- cards ----------

export function allCards() {
  const map = new Map(bundled);
  for (const [id, c] of Object.entries(userCards)) map.set(id, c);
  return [...map.values()].filter((c) => !hidden.has(c.id));
}

export const cardsFor = (lang, topic) => allCards().filter((c) => c.language === lang && c.topic === topic);
export const getCard = (id) => (hidden.has(id) ? null : userCards[id] || bundled.get(id) || null);

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
  return [...hidden].filter((id) => { const c = bundled.get(id); return c && c.language === lang && c.topic === topic; });
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

// ---------- settings ----------

export const getSettings = () => settings;
export function setSettings(patch) { settings = { ...settings, ...patch }; write(K.settings, settings); }

// ---------- import / export ----------

export function buildExport({ lang = null, topic = null, includeProgress = false } = {}) {
  const cards = allCards().filter((c) => (!lang || c.language === lang) && (!topic || c.topic === topic));
  const out = { format: FORMAT, version: VERSION, exportedAt: new Date().toISOString(), cards };
  if (includeProgress) {
    out.progress = {};
    for (const c of cards) if (progress[c.id]) out.progress[c.id] = progress[c.id];
  }
  return out;
}

export function validateCard(c) {
  const errs = [];
  if (!c || typeof c !== 'object') return ['not an object'];
  if (!c.id || typeof c.id !== 'string') errs.push('id missing');
  if (!['de', 'ja'].includes(c.language)) errs.push('language must be "de" or "ja"');
  if (!c.topic) errs.push('topic missing');
  if (!c.prompt || typeof c.prompt !== 'object') errs.push('prompt missing');
  if (!Array.isArray(c.answer?.accepted) || !c.answer.accepted.length) errs.push('answer.accepted must be a non-empty list');
  if (c.topic === 'nominalisierung' && !c.prompt?.verbalstil) errs.push('prompt.verbalstil missing');
  if (c.topic === 'verb-conjugation' && (!c.prompt?.verb || !c.prompt?.sentence)) errs.push('prompt.verb / prompt.sentence missing');
  if (c.topic === 'vocab' && !c.prompt?.word) errs.push('prompt.word missing');
  return errs;
}

/** Parse an import file. Accepts the full format or a bare array of cards. */
export function parseImport(text, fileName = 'import') {
  let data;
  try { data = JSON.parse(text); } catch (e) { return { error: `JSON: ${e.message}` }; }
  const list = Array.isArray(data) ? data : data?.cards;
  if (!Array.isArray(list)) return { error: 'no "cards" list found' };
  const cards = [];
  const invalid = [];
  list.forEach((c, i) => {
    const errs = validateCard(c);
    if (errs.length) invalid.push(`#${i + 1} ${c?.id ?? ''}: ${errs.join(', ')}`);
    else cards.push(c.source ? c : { ...c, source: `import:${fileName}` });
  });
  const existing = cards.filter((c) => getCard(c.id) || bundled.has(c.id)).length;
  return { cards, invalid, existing, fresh: cards.length - existing, progress: Array.isArray(data) ? null : data.progress || null };
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
  write(K.user, userCards);
  write(K.hidden, [...hidden]);
  write(K.progress, progress);
  return { added, updated, skipped, progressCount };
}
