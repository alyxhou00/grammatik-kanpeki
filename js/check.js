// Answer checking and word-level diff. How answers are compared comes from the course
// (LANGS[lang] in js/topics.js): `normalize`, `ruby` (match by surface or by reading) and `nearMatch`.
import { toSurface, toKana } from './text.js';
import { LANGS } from './topics.js';

/** The forms of an answer text a typed answer may match (with furigana: the surface and the reading). */
function forms(L, text) {
  return L.ruby ? [L.normalize(toSurface(text)), L.normalize(toKana(text))] : [L.normalize(text)];
}

/**
 * verdict: correct | acceptable | mistake | close | wrong | empty
 * target: the accepted answer closest to the input (used for the diff).
 */
export function checkAnswer(card, input) {
  const a = card.answer || {};
  const accepted = a.accepted || [];
  const acceptable = a.acceptable || [];
  const mistakes = a.mistakes || [];
  const L = LANGS[card.language];
  const u = L.normalize(input);
  const target = nearest(L, input, accepted);

  if (!u) return { verdict: 'empty', target };
  for (const t of accepted) if (forms(L, t).includes(u)) return { verdict: 'correct', matched: t, target: t };
  for (const item of acceptable) if (forms(L, item.text).includes(u)) return { verdict: 'acceptable', matched: item.text, note: item.note, target };
  for (const item of mistakes) if (forms(L, item.text).includes(u)) return { verdict: 'mistake', matched: item.text, note: item.note, target };

  if (L.nearMatch) {
    const lower = u.toLowerCase();
    for (const t of accepted) if (L.normalize(t).toLowerCase() === lower) return { verdict: 'close', reason: 'case', target: t };
    const tt = tokenize(L.normalize(target));
    const ut = tokenize(u);
    const d = levenshtein(ut.map((x) => x.toLowerCase()), tt.map((x) => x.toLowerCase()));
    if (d <= 2 && d <= Math.ceil(tt.length * 0.2)) return { verdict: 'close', reason: 'near', target };
  }
  return { verdict: 'wrong', target };
}

/** The accepted answer closest to the input by words (only for courses with `nearMatch`; else the first). */
function nearest(L, input, list) {
  if (!list.length) return '';
  if (!L.nearMatch || !input) return list[0];
  const ut = tokenize(L.normalize(input)).map((x) => x.toLowerCase());
  let best = list[0];
  let bestD = Infinity;
  for (const t of list) {
    const d = levenshtein(ut, tokenize(L.normalize(t)).map((x) => x.toLowerCase()));
    if (d < bestD) { bestD = d; best = t; }
  }
  return best;
}

export function tokenize(s) {
  return String(s ?? '').match(/[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*|[^\s\p{L}\p{N}]/gu) || [];
}

function levenshtein(a, b) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return dp[a.length][b.length];
}

/** Word diff via LCS. Returns {mine:[{t,same}], theirs:[{t,same}]}. */
export function wordDiff(mineText, theirsText) {
  const a = tokenize(mineText);
  const b = tokenize(theirsText);
  const dp = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const mine = [];
  const theirs = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { mine.push({ t: a[i++], same: true }); theirs.push({ t: b[j++], same: true }); }
    else if (dp[i + 1][j] >= dp[i][j + 1]) mine.push({ t: a[i++], same: false });
    else theirs.push({ t: b[j++], same: false });
  }
  while (i < a.length) mine.push({ t: a[i++], same: false });
  while (j < b.length) theirs.push({ t: b[j++], same: false });
  return { mine, theirs };
}
