// Answer checking and word-level diff.
import { toSurface, toKana, kataToHira, isRomaji, romajiToHiragana } from './text.js';

export function normalizeDe(s) {
  return String(s ?? '')
    .normalize('NFC')
    .replace(/[„“”«»"]/g, '"')
    .replace(/[‚‘’']/g, "'")
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .trim()
    .replace(/[.!?]+$/, '')
    .trim();
}

export function normalizeJa(s) {
  let t = String(s ?? '').normalize('NFKC').replace(/[\s。、．，！？!?.,「」]/g, '');
  if (isRomaji(t)) t = romajiToHiragana(t);
  return kataToHira(t);
}

const forms = (card, text) =>
  card.language === 'ja'
    ? [normalizeJa(toSurface(text)), normalizeJa(toKana(text))]
    : [normalizeDe(text)];

/**
 * verdict: correct | acceptable | mistake | close | wrong | empty
 * target: the accepted answer closest to the input (used for the diff).
 */
export function checkAnswer(card, input) {
  const a = card.answer || {};
  const accepted = a.accepted || [];
  const acceptable = a.acceptable || [];
  const mistakes = a.mistakes || [];
  const u = card.language === 'ja' ? normalizeJa(input) : normalizeDe(input);
  const target = nearest(card, input, accepted);

  if (!u) return { verdict: 'empty', target };
  for (const t of accepted) if (forms(card, t).includes(u)) return { verdict: 'correct', matched: t, target: t };
  for (const item of acceptable) if (forms(card, item.text).includes(u)) return { verdict: 'acceptable', matched: item.text, note: item.note, target };
  for (const item of mistakes) if (forms(card, item.text).includes(u)) return { verdict: 'mistake', matched: item.text, note: item.note, target };

  if (card.language === 'de') {
    const lower = u.toLowerCase();
    for (const t of accepted) if (normalizeDe(t).toLowerCase() === lower) return { verdict: 'close', reason: 'case', target: t };
    const tt = tokenize(normalizeDe(target));
    const ut = tokenize(u);
    const d = levenshtein(ut.map((x) => x.toLowerCase()), tt.map((x) => x.toLowerCase()));
    if (d <= 2 && d <= Math.ceil(tt.length * 0.2)) return { verdict: 'close', reason: 'near', target };
  }
  return { verdict: 'wrong', target };
}

function nearest(card, input, list) {
  if (!list.length) return '';
  if (card.language === 'ja' || !input) return list[0];
  const ut = tokenize(normalizeDe(input)).map((x) => x.toLowerCase());
  let best = list[0];
  let bestD = Infinity;
  for (const t of list) {
    const d = levenshtein(ut, tokenize(normalizeDe(t)).map((x) => x.toLowerCase()));
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
