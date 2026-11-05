// Pitch accent for Japanese words shown on their own (word card, word popup, dictionary form).
//
// Read aloud, a single word comes from its kana (js/speech.js), so homophones sound alike: はし for
// 箸, 橋 and 端. The marks drawn here show the difference instead: a line over the high morae, under
// the low ones, with a step where the pitch changes, and a short tail for the particle after the
// word (が), because 橋 (drops before が) and 端 (stays high) only differ there.
//
// The data is Kanjium's accents.txt (CC BY-SA 4.0), converted by tools/pitch.mjs into small JSON
// files that a course names with `pitch` in js/topics.js. Each file holds the words whose reading
// hashes to it, so a word costs one small fetch, and nothing is loaded before a word is shown.
// No server: the files are static, like the cards.
import { toSurface, toKana, esc } from './text.js';

export const SHARDS = 128;

/** Katakana → hiragana (ー and other marks stay). Readings are keyed in hiragana. */
export const hira = (s) => String(s).replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));

/** Which data file holds a reading (FNV-1a over its code points). */
export function shardOf(reading) {
  let h = 0x811c9dc5;
  for (const ch of hira(reading)) h = Math.imul(h ^ ch.codePointAt(0), 0x01000193) >>> 0;
  return h % SHARDS;
}

export const shardName = (n) => `${String(n).padStart(3, '0')}.json`;

// Small kana belong to the mora before them (きょ, ファ); っ, ん and ー are morae of their own.
const SMALL = /[ゃゅょぁぃぅぇぉゎャュョァィゥェォヮ]/;

/** Split kana into morae: きょうと → きょ・う・と. */
export function morae(kana) {
  const out = [];
  for (const ch of String(kana)) {
    if (SMALL.test(ch) && out.length) out[out.length - 1] += ch;
    else out.push(ch);
  }
  return out;
}

/**
 * High (true) or low (false) for each mora, plus one more for the particle after the word.
 * `accent` is the mora after which the pitch drops; 0 is flat (平板: low, then high, and stays high).
 * null when the accent does not fit the word.
 */
export function levels(count, accent) {
  if (!Number.isInteger(accent) || accent < 0 || accent > count || count < 1) return null;
  return Array.from({ length: count + 1 }, (_, i) => {
    if (accent === 1) return i === 0;
    if (i === 0) return false;
    return accent === 0 || i < accent;
  });
}

/** 平板型, 頭高型, 中高型, 尾高型: the names Japanese dictionaries use. */
export function accentType(count, accent) {
  if (accent === 0) return '平板型';
  if (accent === 1) return '頭高型';
  return accent === count ? '尾高型' : '中高型';
}

/** Markup for one reading with one accent, or '' when the accent does not fit. */
export function pitchHTML(kana, accent) {
  const m = morae(kana);
  const lv = levels(m.length, accent);
  if (!lv) return '';
  const cells = lv.map((high, i) => {
    const step = i > 0 && high !== lv[i - 1] ? ' step' : '';
    return i < m.length
      ? `<span class="m ${high ? 'h' : 'l'}${step}">${esc(m[i])}</span>`
      : `<span class="m tail ${high ? 'h' : 'l'}${step}" aria-hidden="true"></span>`;
  });
  return `<span class="pitch" title="${accentType(m.length, accent)} [${accent}]">${cells.join('')}</span>`;
}

const KANJI = /[㐀-鿿豈-﫿々〆]/;

/**
 * The accents of a word (furigana markup) in one data file, most common first, or null.
 * A word is found by its spelling and its reading, so 箸, 橋 and 端 each get their own. A word written
 * in kana (すごい, where the data has 凄い) is found only when every word with that reading has the
 * same accent: はし on its own could be any of three, and a wrong mark is worse than none.
 */
export function accentsIn(table, word) {
  const entries = table?.[hira(toKana(word))];
  if (!entries) return null;
  const surface = toSurface(word);
  if (entries[surface]) return entries[surface];
  if (KANJI.test(surface)) return null;
  const all = Object.values(entries);
  return new Set(all.map((a) => a.join())).size === 1 ? all[0] : null;
}

const files = new Map(); // url → Promise of the parsed file

function loadShard(dir, reading) {
  const url = `${dir}/${shardName(shardOf(reading))}`;
  if (!files.has(url)) {
    const p = fetch(url).then((r) => (r.ok ? r.json() : {})).catch(() => {
      files.delete(url); // offline: try again next time
      return {};
    });
    files.set(url, p);
  }
  return files.get(url);
}

/** The accents of a word, from the course's data folder `dir`. */
export async function lookup(dir, word) {
  if (!dir || !word) return null;
  return accentsIn(await loadShard(dir, hira(toKana(word))), word);
}

/**
 * The element that shows a word's reading. With pitch data (`dir`), it says which word to look up,
 * and hydrate() draws the accent into it once the data is there. `hidden` keeps it out of sight
 * until then (for a word in kana, the reading alone would only repeat it).
 */
export function readingHTML(word, lang, cls, { dir = '', hidden = false } = {}) {
  return `<div class="${cls}" lang="${esc(lang)}"${dir ? ` data-pitch="${esc(word)}" data-pitch-dir="${esc(dir)}"` : ''}${hidden ? ' hidden' : ''}>${esc(toKana(word))}</div>`;
}

/** Draw the accent into every reading under `root` that asks for one (see readingHTML). */
export function hydrate(root) {
  for (const el of root.querySelectorAll('[data-pitch]')) {
    const { pitch: word, pitchDir: dir } = el.dataset;
    el.removeAttribute('data-pitch');
    lookup(dir, word).then((accents) => {
      if (!accents || !el.isConnected) return;
      const html = accents.slice(0, 3).map((a) => pitchHTML(toKana(word), a)).filter(Boolean).join('');
      if (!html) return;
      el.innerHTML = html;
      el.classList.add('has-pitch');
      el.hidden = false;
    });
  }
}
