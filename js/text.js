// Text helpers: HTML escaping, furigana markup, romaji → kana.

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** Pick a string from a localized value (string or {de, en, zh-Hant}). */
export function loc(value, prefer = []) {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  for (const k of prefer) if (value[k]) return value[k];
  const first = Object.values(value).find(Boolean);
  return first || '';
}

// ---------- Furigana ----------
// Markup: {漢字|かんじ}. Example: "{食|た}べる" → <ruby>食<rt>た</rt></ruby>べる

const RUBY = /\{([^|{}]+)\|([^{}]+)\}/g;

export const toSurface = (s) => String(s ?? '').replace(RUBY, '$1');
export const toKana = (s) => String(s ?? '').replace(RUBY, '$2');

export function rubyHTML(s) {
  s = String(s ?? '');
  let out = '';
  let last = 0;
  for (const m of s.matchAll(RUBY)) {
    out += esc(s.slice(last, m.index));
    out += `<ruby>${esc(m[1])}<rt>${esc(m[2])}</rt></ruby>`;
    last = m.index + m[0].length;
  }
  return out + esc(s.slice(last));
}

export const BLANK = '___';

/**
 * Split a sentence into plain text and known words. `words[i].text` is the word exactly as it is
 * written in the sentence (with furigana markup); words are matched left to right.
 */
export function wordSegments(sentence, words = []) {
  sentence = String(sentence ?? '');
  const out = [];
  let pos = 0;
  for (const w of words) {
    const i = findWord(sentence, w.text, pos);
    if (i < 0) continue;
    if (i > pos) out.push({ text: sentence.slice(pos, i) });
    out.push({ text: w.text, word: w });
    pos = i + w.text.length;
  }
  if (pos < sentence.length) out.push({ text: sentence.slice(pos) });
  return out;
}

// Letters of space-separated scripts (German etc.). Japanese has no spaces, so it is matched anywhere.
const SPACED = /[A-Za-zÀ-ɏ]/;

/** Index of `word` in `s` from `from`, not inside a longer Latin-script word ("an" does not match in "Mann"). */
function findWord(s, word, from) {
  if (!word) return -1;
  for (let i = s.indexOf(word, from); i >= 0; i = s.indexOf(word, i + 1)) {
    const before = s[i - 1] || '';
    const after = s[i + word.length] || '';
    const cutsBefore = SPACED.test(word[0]) && SPACED.test(before);
    const cutsAfter = SPACED.test(word[word.length - 1]) && SPACED.test(after);
    if (!cutsBefore && !cutsAfter) return i;
  }
  return -1;
}

/** A hoverable word. The popup reads lemma / meaning / part of speech from data-word. */
function wordSpan(w, inner) {
  if (!w) return inner;
  const data = { lemma: w.lemma || w.text, meaning: w.meaning, pos: w.pos };
  return `<span class="word" tabindex="0" role="button" data-word="${esc(JSON.stringify(data))}">${inner}</span>`;
}

/**
 * Sentence with ___ replaced by a blank box, or by the (furigana) answer.
 * With `words`, known words become hoverable; `fillWord` makes the filled-in answer hoverable too.
 */
export function sentenceHTML(sentence, fill = null, words = [], fillWord = null) {
  const slot = fill == null
    ? '<span class="blank" aria-label="blank"></span>'
    : wordSpan(fillWord, `<span class="blank filled">${rubyHTML(fill)}</span>`);
  return wordSegments(sentence, words)
    .map((seg) => (seg.word ? wordSpan(seg.word, rubyHTML(seg.text)) : seg.text.split(BLANK).map(rubyHTML).join(slot)))
    .join('');
}

// ---------- Kana ----------

export function kataToHira(s) {
  return s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
}

const ROMAJI = {
  a: 'あ', i: 'い', u: 'う', e: 'え', o: 'お',
  ka: 'か', ki: 'き', ku: 'く', ke: 'け', ko: 'こ', kya: 'きゃ', kyu: 'きゅ', kyo: 'きょ',
  ga: 'が', gi: 'ぎ', gu: 'ぐ', ge: 'げ', go: 'ご', gya: 'ぎゃ', gyu: 'ぎゅ', gyo: 'ぎょ',
  sa: 'さ', shi: 'し', si: 'し', su: 'す', se: 'せ', so: 'そ',
  sha: 'しゃ', shu: 'しゅ', sho: 'しょ', she: 'しぇ', sya: 'しゃ', syu: 'しゅ', syo: 'しょ',
  za: 'ざ', ji: 'じ', zi: 'じ', zu: 'ず', ze: 'ぜ', zo: 'ぞ',
  ja: 'じゃ', ju: 'じゅ', jo: 'じょ', je: 'じぇ', jya: 'じゃ', jyu: 'じゅ', jyo: 'じょ', zya: 'じゃ', zyu: 'じゅ', zyo: 'じょ',
  ta: 'た', chi: 'ち', ti: 'ち', tsu: 'つ', tu: 'つ', te: 'て', to: 'と',
  cha: 'ちゃ', chu: 'ちゅ', cho: 'ちょ', che: 'ちぇ', tya: 'ちゃ', tyu: 'ちゅ', tyo: 'ちょ',
  da: 'だ', di: 'ぢ', du: 'づ', de: 'で', do: 'ど',
  na: 'な', ni: 'に', nu: 'ぬ', ne: 'ね', no: 'の', nya: 'にゃ', nyu: 'にゅ', nyo: 'にょ',
  ha: 'は', hi: 'ひ', fu: 'ふ', hu: 'ふ', he: 'へ', ho: 'ほ', hya: 'ひゃ', hyu: 'ひゅ', hyo: 'ひょ',
  fa: 'ふぁ', fi: 'ふぃ', fe: 'ふぇ', fo: 'ふぉ',
  ba: 'ば', bi: 'び', bu: 'ぶ', be: 'べ', bo: 'ぼ', bya: 'びゃ', byu: 'びゅ', byo: 'びょ',
  pa: 'ぱ', pi: 'ぴ', pu: 'ぷ', pe: 'ぺ', po: 'ぽ', pya: 'ぴゃ', pyu: 'ぴゅ', pyo: 'ぴょ',
  ma: 'ま', mi: 'み', mu: 'む', me: 'め', mo: 'も', mya: 'みゃ', myu: 'みゅ', myo: 'みょ',
  ya: 'や', yu: 'ゆ', yo: 'よ',
  ra: 'ら', ri: 'り', ru: 'る', re: 'れ', ro: 'ろ', rya: 'りゃ', ryu: 'りゅ', ryo: 'りょ',
  wa: 'わ', wo: 'を', wi: 'うぃ', we: 'うぇ',
  xa: 'ぁ', xi: 'ぃ', xu: 'ぅ', xe: 'ぇ', xo: 'ぉ', la: 'ぁ', li: 'ぃ', lu: 'ぅ', le: 'ぇ', lo: 'ぉ',
  xya: 'ゃ', xyu: 'ゅ', xyo: 'ょ', lya: 'ゃ', lyu: 'ゅ', lyo: 'ょ',
  xtu: 'っ', ltu: 'っ', xtsu: 'っ', ltsu: 'っ',
  '-': 'ー',
};

export const isRomaji = (s) => /[a-z]/i.test(s) && /^[a-z'\-\s.,!?]+$/i.test(s);

export function romajiToHiragana(input) {
  const s = input.toLowerCase();
  let out = '';
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    const n1 = s[i + 1];
    if (c === 'n') {
      if (n1 === "'") { out += 'ん'; i += 2; continue; }
      if (n1 === 'n') {
        // "nn" + vowel/y → ん + n-row (こんな, こんにちは); otherwise "nn" → ん
        const n2 = s[i + 2];
        if (n2 && 'aiueoy'.includes(n2)) { out += 'ん'; i += 1; } else { out += 'ん'; i += 2; }
        continue;
      }
      if (n1 === undefined || !'aiueoy'.includes(n1)) { out += 'ん'; i += 1; continue; }
    }
    if (c === n1 && /[bcdfghjkmpqrstvwxz]/.test(c)) { out += 'っ'; i += 1; continue; }
    if (c === 't' && n1 === 'c' && s[i + 2] === 'h') { out += 'っ'; i += 1; continue; }
    let hit = false;
    for (let len = 4; len > 0; len--) {
      const chunk = s.substr(i, len);
      if (ROMAJI[chunk]) { out += ROMAJI[chunk]; i += len; hit = true; break; }
    }
    if (!hit) { out += c; i += 1; }
  }
  return out;
}

// ---------- answer normalizers (a course picks one as LANGS[lang].normalize) ----------

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
