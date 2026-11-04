// Study log: how much was studied on each day, for the streak and the heatmap.
// Pure functions (no DOM, no storage); js/store.js keeps the log in localStorage.
//
// Log shape: { 'YYYY-MM-DD': { [lang]: { n, new, again } } }
//   n     answers graded that day (in "Lernen" and in "Alle üben"),
//   new   cards answered for the first time,
//   again answers graded "Again".
// Days are study days: like the scheduler's days they start at 4 AM local time, so the
// date is the one from js/srs.js dayIndex().
//
// The log keeps counts per day, not one entry per answer: localStorage holds about 5 MB in
// total, and a year of per-day counts is a few kilobytes. Merging two logs (an import now, a
// sync later) keeps the larger count per day, language and field, so importing the same file
// twice changes nothing.

const DAY_MS = 864e5;
export const FIELDS = ['n', 'new', 'again'];
const KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Day number (js/srs.js dayIndex) → 'YYYY-MM-DD'. */
export const dayKey = (day) => new Date(day * DAY_MS).toISOString().slice(0, 10);
/** 'YYYY-MM-DD' → day number. */
export const keyDay = (key) => Math.round(Date.parse(`${key}T00:00:00Z`) / DAY_MS);
/** Weekday of a day number: 0 = Sunday … 6 = Saturday. */
export const weekday = (day) => new Date(day * DAY_MS).getUTCDay();

/** The log with one more answer. The given log is not changed. */
export function addAnswer(log, { day, lang, isNew = false, again = false }) {
  const k = dayKey(day);
  const prev = log[k]?.[lang] || {};
  const e = { n: (prev.n || 0) + 1, new: (prev.new || 0) + (isNew ? 1 : 0), again: (prev.again || 0) + (again ? 1 : 0) };
  return { ...log, [k]: { ...log[k], [lang]: e } };
}

/** Answers on one day, in all languages or in one. */
export function countOn(log, day, lang = null) {
  const d = log[dayKey(day)];
  if (!d) return 0;
  if (lang) return d[lang]?.n || 0;
  return Object.values(d).reduce((sum, e) => sum + (e?.n || 0), 0);
}

/** Answers per language on one day: [[lang, n], …], busiest first. */
export function langsOn(log, day) {
  return Object.entries(log[dayKey(day)] || {})
    .map(([lang, e]) => [lang, e?.n || 0])
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1]);
}

/**
 * Streaks, counted in study days with at least one answer.
 * The current streak ends today, or yesterday if nothing was studied today yet:
 * as in Duolingo, it only breaks once a whole day has passed without studying.
 */
export function streaks(log, today, lang = null) {
  const studied = new Set();
  for (const k of Object.keys(log)) {
    if (!KEY_RE.test(k)) continue;
    const day = keyDay(k);
    if (day <= today && countOn(log, day, lang) > 0) studied.add(day);
  }
  const studiedToday = studied.has(today);
  let current = 0;
  for (let d = studiedToday ? today : today - 1; studied.has(d); d--) current++;
  let longest = 0;
  let run = 0;
  let prev = null;
  for (const d of [...studied].sort((a, b) => a - b)) {
    run = prev === d - 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
    prev = d;
  }
  return { current, longest, studiedToday, days: studied.size };
}

/**
 * A GitHub-style calendar: one column per week (oldest first), one row per weekday,
 * ending with the week that contains `today`. weekStart: 0 = Sunday, 1 = Monday.
 * Days after today are null. level: 0 = nothing studied, 1–4 = up to a quarter, half,
 * three quarters, or all of the busiest day shown.
 */
export function heatmap(log, today, { weeks = 53, weekStart = 1, lang = null } = {}) {
  const row = (day) => (weekday(day) - weekStart + 7) % 7;
  const first = today - row(today) - (weeks - 1) * 7;
  const cols = [];
  let max = 0;
  let total = 0;
  let days = 0;
  for (let w = 0; w < weeks; w++) {
    const col = [];
    for (let r = 0; r < 7; r++) {
      const day = first + w * 7 + r;
      if (day > today) { col.push(null); continue; }
      const n = countOn(log, day, lang);
      max = Math.max(max, n);
      total += n;
      if (n) days++;
      col.push({ day, n, level: 0 });
    }
    cols.push(col);
  }
  for (const col of cols) for (const c of col) if (c?.n) c.level = Math.min(4, Math.ceil((4 * c.n) / max));
  return { weeks: cols, first, max, total, days };
}

/** Only the given language's entries (for an export of one course). */
export function onlyLang(log, lang) {
  const out = {};
  for (const [k, d] of Object.entries(log)) if (d?.[lang]) out[k] = { [lang]: d[lang] };
  return out;
}

/**
 * Two logs combined: the larger count per day, language and field.
 * Entries that don't look like a study log (from a hand-edited import file) are skipped.
 */
export function mergeLogs(a, b) {
  const out = structuredClone(a || {});
  let days = 0;
  for (const [k, d] of Object.entries(b && typeof b === 'object' ? b : {})) {
    if (!KEY_RE.test(k) || Number.isNaN(keyDay(k)) || !d || typeof d !== 'object') continue;
    let used = false;
    for (const [lang, e] of Object.entries(d)) {
      if (!e || typeof e !== 'object') continue;
      const cur = out[k]?.[lang] || {};
      const next = {};
      for (const f of FIELDS) {
        const v = Number.isInteger(e[f]) && e[f] >= 0 ? e[f] : 0;
        next[f] = Math.max(cur[f] || 0, v);
      }
      if (!next.n) continue;
      out[k] = { ...out[k], [lang]: next };
      used = true;
    }
    if (used) days++;
  }
  return { log: out, days };
}
