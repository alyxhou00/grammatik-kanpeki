// Card types: how a card is drawn. Topics pick a type in js/topics.js, so a new topic needs no code here.
//
//   rewrite  rewrite a whole sentence (prompt.source → typed sentence), e.g. Nominalisierung
//   cloze    fill the blank (___) in prompt.sentence, optionally from a base word, e.g. 動詞變化, 助詞
//   flip     classic Anki card: see the front, recall the back, grade yourself (word list)
//   sentence a whole sentence on the front, recall its translation, grade yourself (例句本)
//
// Shared by every type: prompt.words (hoverable words), prompt.hint, prompt.translation, prompt.task, prompt.register,
// card.explanation (tabs for each language it has) and chips for card.meta values named in the topic's facets.
// Sentences and words get a speaker button when the browser has a voice for the course (ctx.speak).
// A word shown on its own (word card, dictionary form) gets its pitch accent when the course has the data (js/pitch.js).
//
// Each renderer gets a `ctx` built by app.js: { t, settings, aids, revealed, L (language config),
// labels (topic labels merged with defaults), facets, speak }.
import { esc, loc, rubyHTML, sentenceHTML, isRomaji, romajiToHiragana, toSurface, toKana, shortHash, BLANK } from './text.js';
import { wordDiff } from './check.js';
import { readingHTML } from './pitch.js';
import { LANGS, typeOf } from './topics.js';

// ---------- word list ----------

// A saved word is one sense of a word: its dictionary form plus the meaning it had where it was saved.
// "die Bank" (bench) and "die Bank" (bank), or 方 (かた / ほう), are separate cards.

const clean = (s) => String(s ?? '').normalize('NFC').replace(/\s+/g, ' ').trim();

/** Identity of a word sense, stored as card.meta.sense: "<surface>|<meaning>". */
export const senseKey = (word) => `${clean(toSurface(word.lemma ?? word.text))}|${clean(word.meaning)}`;

/** Card id for a saved word sense, e.g. "de-vocab-die Bank-1x2y3z" (the hash keeps it the same on every device). */
export const vocabId = (lang, word) => `${lang}-vocab-${clean(toSurface(word.lemma ?? word.text))}-${shortHash(senseKey(word))}`;

/**
 * The card in `cards` (the course's word list) that holds this word sense, or null.
 * Matches the stored sense key; cards without one (saved before senses existed, or added by hand)
 * match on the same word and a meaning among their answers.
 */
export function savedWordIn(cards, word) {
  const key = senseKey(word);
  const [surface, meaning] = [clean(toSurface(word.lemma ?? word.text)), clean(word.meaning)];
  return cards.find((c) => c.meta?.sense === key)
    || cards.find((c) => !c.meta?.sense && clean(toSurface(c.prompt?.word)) === surface && (c.answer?.accepted || []).some((m) => clean(m) === meaning))
    || null;
}

/** The sentence a card's hoverable words live in (prompt.words are matched against it). */
export function sentenceOf(card) {
  const p = card?.prompt || {};
  const type = typeOf(card);
  return type === 'rewrite' ? p.source : type === 'flip' ? p.example : p.sentence;
}

/** The full sentence of a card (blank filled with the model answer), used as a word's example. */
export function exampleOf(card) {
  const p = card?.prompt;
  const text = sentenceOf(card);
  if (!text) return null;
  const full = typeOf(card) === 'cloze' ? text.replace(BLANK, card.answer.accepted[0]) : text;
  const type = typeOf(card);
  return { text: full, translation: type === 'flip' ? p.exampleTranslation : type === 'sentence' ? card.answer.accepted[0] : p.translation };
}

/** Build a word-list card from a hovered word and the card it came from. */
export function vocabCardFrom(word, sourceCard, lang) {
  const ex = sourceCard && sourceCard.topic !== 'vocab' ? exampleOf(sourceCard) : null;
  return {
    id: vocabId(lang, word),
    language: lang,
    topic: 'vocab',
    source: sourceCard?.source || 'word-list',
    level: sourceCard?.level,
    tags: word.pos ? [word.pos] : [],
    createdAt: new Date().toLocaleDateString('sv-SE'), // local YYYY-MM-DD
    meta: { savedFrom: sourceCard?.id, sense: senseKey(word) },
    prompt: {
      word: word.lemma,
      pos: word.pos,
      ...(ex ? { example: ex.text, exampleTranslation: ex.translation } : {}),
    },
    answer: { accepted: [word.meaning] },
  };
}

// ---------- shared blocks ----------

const SPEAKER = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5H4Z"/><path class="wave" d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/></g></svg>';

/**
 * A button that reads `text` aloud (furigana markup is fine; app.js handles the click).
 * `main` marks what the R key plays; `word` marks a single word shown on its own, which Japanese reads
 * from its furigana (js/speech.js). Nothing when the browser has no voice for the language.
 */
export function speakButton(ctx, text, lang, { main = false, word = false } = {}) {
  if (!ctx.speak || !text) return '';
  return `<button type="button" class="speak-btn"${main ? ' data-speak-main' : ''}${word ? ' data-speak-word' : ''} data-speak="${esc(text)}" data-speak-lang="${esc(lang)}" title="${esc(ctx.t.speak)}" aria-label="${esc(ctx.t.speak)}">${SPEAKER}</button>`;
}

const TR_LABEL = { de: 'DE', en: 'EN', 'zh-Hant': '中文', ja: '日本語' };

/** Join word tokens back into a sentence with natural spacing. */
function joinTokens(items, render) {
  let out = '';
  items.forEach((x, i) => {
    const noSpace = i === 0 || /^[,.;:!?)»“]$/.test(x.t) || /^[(„«]$/.test(items[i - 1].t);
    out += (noSpace ? '' : ' ') + render(x);
  });
  return out;
}

function aid(ctx, key, label, lang, text) {
  if (!text) return '';
  return `<details class="aid" data-aid="${key}" ${ctx.aids.has(key) ? 'open' : ''}>
    <summary>${esc(label)}</summary><div class="aid-body" lang="${lang}">${esc(text)}</div></details>`;
}

/**
 * Translation and hint. Beginner languages show the main translation; the rest sit behind a click.
 * Defaults to the prompt's own; flip cards pass their example's translation instead.
 */
function aidsBlock(card, ctx, { translation = card.prompt.translation, hint = card.prompt.hint } = {}) {
  const tr = typeof translation === 'string' ? { [ctx.L.noteLang]: translation } : translation || {};
  const shown = ctx.L.translation === 'always' && tr[ctx.L.noteLang] ? ctx.L.noteLang : null;
  const hidden = Object.keys(tr).filter((k) => k !== shown && k !== card.language && tr[k]);
  const aids = [
    aid(ctx, 'hint', ctx.t.tip, ctx.L.noteLang, loc(hint, [ctx.L.noteLang])),
    ...hidden.map((k) => aid(ctx, `tr-${k}`, TR_LABEL[k] || k, k, tr[k])),
  ].join('');
  return `${shown ? `<p class="translation" lang="${shown}">${esc(tr[shown])}</p>` : ''}
    ${aids ? `<div class="aids">${aids}</div>` : ''}`;
}

/** Explanation, with a tab per language when the card has more than one. */
function explanationBlock(card, ctx) {
  const ex = card.explanation;
  if (!ex) return '';
  if (typeof ex === 'string') {
    return `<section class="explain"><h4>${ctx.t.explanation}</h4><p lang="${ctx.L.noteLang}">${esc(ex)}</p></section>`;
  }
  const known = ctx.L.explainLangs.filter(([k]) => ex[k]);
  const extra = Object.keys(ex).filter((k) => ex[k] && !known.some(([x]) => x === k)).map((k) => [k, TR_LABEL[k] || k]);
  const available = [...known, ...extra];
  if (!available.length) return '';
  const pref = ctx.settings.explainLang?.[card.language];
  const cur = available.some(([k]) => k === pref) ? pref : available[0][0];
  const tabs = available.length > 1
    ? `<div class="seg small" role="tablist">${available.map(([k, l]) => `<button type="button" role="tab" data-explain="${k}" aria-selected="${k === cur}">${esc(l)}</button>`).join('')}</div>`
    : '';
  return `<section class="explain">
    <div class="explain-head"><h4>${ctx.t.explanation}</h4>${tabs}</div>
    <p lang="${cur}">${esc(ex[cur])}</p></section>`;
}

/** Chips for card.meta values that the topic gives a name to (e.g. verb class). */
function chipsBlock(card, ctx) {
  const chips = Object.entries(ctx.facets || {})
    .map(([key, names]) => card.meta?.[key] && (names[card.meta[key]] || card.meta[key]))
    .filter(Boolean);
  return chips.length ? `<div class="chips">${chips.map((c) => `<span class="group-chip">${esc(c)}</span>`).join('')}</div>` : '';
}

/** The task chip (e.g. ない形). It can stay hidden until asked for (setting "showForm"). */
function taskChip(card, ctx) {
  const task = loc(card.prompt.task, [ctx.L.noteLang]);
  if (!task) return '';
  const show = ctx.settings.showForm || ctx.revealed || ctx.aids.has('form');
  return show
    ? `<div class="form-chip">${esc(task)}</div>`
    : `<button type="button" class="form-chip ghost" data-action="show-form">${esc(ctx.labels.showTask)}</button>`;
}

/** The register label (e.g. 普通形 or 禮貌): which politeness the answer is in. Always shown, as the task alone cannot say. */
function registerChip(card, ctx, cls = '') {
  const r = card.prompt.register;
  if (!r) return '';
  return `<span class="register-chip${cls}" data-register="${esc(r)}">${esc(ctx.L.registers[r] || r)}</span>`;
}

/** Register label and task chip side by side. */
function taskChips(card, ctx) {
  const chips = registerChip(card, ctx) + taskChip(card, ctx);
  return chips ? `<div class="task-chips">${chips}</div>` : '';
}

const noteHTML = (note, lang) => (note ? `<p class="note" lang="${lang}">${esc(loc(note, [lang]))}</p>` : '');

/** The learner's answer as typed (in a course with romaji input, romaji is also shown as kana). */
function typedHTML(card, input) {
  const v = input.trim();
  if (!v) return '—';
  if (LANGS[card.language].romajiInput && isRomaji(v)) return `${esc(romajiToHiragana(v))} <span class="muted small">(${esc(v)})</span>`;
  return esc(v);
}

/**
 * Answers that are correct but not ideal. After an exactly correct answer they sit behind a click,
 * so the label does not read as a verdict on the learner's answer.
 */
function acceptableBlock(card, ctx, result) {
  const a = card.answer;
  if (!a.acceptable?.length) return '';
  const list = `<ul class="alts meh" lang="${card.language}">${a.acceptable
    .map((x) => `<li>${rubyHTML(x.text)}${noteHTML(x.note, ctx.L.noteLang)}</li>`).join('')}</ul>`;
  if (result.verdict === 'correct') {
    return `<details class="answer-row more-alts"><summary class="label">${ctx.t.okButNotMore} <span class="count">(${a.acceptable.length})</span></summary>${list}</details>`;
  }
  return `<div class="answer-row"><div class="label">${ctx.t.okButNot}</div>${list}</div>`;
}

const textInput = (card, ctx) => `<input id="answer" lang="${card.language}" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="${esc(ctx.labels.placeholder)}">
  ${LANGS[card.language].romajiInput ? `<div id="kana-preview" class="kana-preview" lang="${card.language}" aria-live="polite"></div>` : ''}`;

const sentenceClass = (card) => `prompt-sentence${LANGS[card.language].sentenceClass ? ` ${LANGS[card.language].sentenceClass}` : ''}`;

// ---------- types ----------

export const CARD_RENDERERS = {
  rewrite: {
    multiline: true,
    front(card, ctx) {
      const p = card.prompt;
      return `<div class="eyebrow">${esc(ctx.labels.source)}</div>
        <p class="${sentenceClass(card)}" lang="${card.language}">${sentenceHTML(p.source, null, p.words || [])}${speakButton(ctx, p.source, card.language, { main: true })}</p>
        ${p.task || p.register ? `<div class="task-row">${taskChips(card, ctx)}</div>` : ''}
        ${aidsBlock(card, ctx)}`;
    },
    input(card, ctx) {
      return `<label class="eyebrow" for="answer">${esc(ctx.labels.target)}</label>
        <textarea id="answer" lang="${card.language}" rows="3" spellcheck="false" autocomplete="off" autocapitalize="off" placeholder="${esc(ctx.labels.placeholder)}"></textarea>`;
    },
    back(card, result, input, ctx) {
      const t = ctx.t;
      const a = card.answer;
      const lang = card.language;
      const target = result.target || a.accepted[0];
      let mine;
      let model;
      if (result.verdict === 'correct') {
        mine = esc(input.trim());
        model = '';
      } else {
        const strip = (x) => toSurface(x).trim().replace(/[.!?。]+$/, '');
        const d = wordDiff(strip(input), strip(target));
        // Only mark word differences when the two sentences mostly overlap; otherwise it is noise.
        const overlap = d.theirs.filter((x) => x.same).length / Math.max(1, d.theirs.length);
        const mark = overlap >= 0.4;
        mine = input.trim() ? (mark ? joinTokens(d.mine, (x) => (x.same ? esc(x.t) : `<del>${esc(x.t)}</del>`)) : esc(input.trim())) : '—';
        model = mark ? joinTokens(d.theirs, (x) => (x.same ? esc(x.t) : `<ins>${esc(x.t)}</ins>`)) : rubyHTML(target);
      }
      const others = a.accepted.filter((x) => x !== target && x !== result.matched);
      // The sentence to listen to: the model answer, or your own when it was right.
      const say = speakButton(ctx, result.verdict === 'correct' ? input.trim() : target, lang);
      return `
        <div class="answer-row"><div class="label">${t.yourAnswer}</div><p class="val mine v-${result.verdict}" lang="${lang}">${mine}${model ? '' : say}</p></div>
        ${model ? `<div class="answer-row"><div class="label">${t.model}</div><p class="val model" lang="${lang}">${model}${say}</p></div>` : ''}
        ${others.length ? `<div class="answer-row"><div class="label">${t.alsoCorrect}</div><ul class="alts" lang="${lang}">${others.map((x) => `<li>${rubyHTML(x)}</li>`).join('')}</ul></div>` : ''}
        ${acceptableBlock(card, ctx, result)}
        ${chipsBlock(card, ctx)}
        ${explanationBlock(card, ctx)}`;
    },
    summary(card) {
      return `<div class="sum-main" lang="${card.language}">${rubyHTML(card.prompt.source)}</div>
        <div class="sum-sub" lang="${card.language}">→ ${rubyHTML(card.answer.accepted[0])}</div>`;
    },
  },

  cloze: {
    front(card, ctx) {
      const p = card.prompt;
      const lang = card.language;
      const base = p.base?.word
        ? `<div class="base-block">
            <div class="eyebrow">${esc(ctx.labels.base)}</div>
            <div class="base-word" lang="${lang}">${rubyHTML(p.base.word)}${speakButton(ctx, p.base.word, lang, { word: true })}</div>
            ${ctx.L.pitch ? readingHTML(p.base.word, lang, 'base-reading', { dir: ctx.L.pitch, hidden: true }) : ''}
            ${p.base.meaning ? `<div class="meaning" lang="${ctx.L.noteLang}">${esc(p.base.meaning)}</div>` : ''}
          </div>`
        : '';
      const task = taskChips(card, ctx);
      // The filled-in answer is hoverable as the base word (e.g. 食べない → 食べる).
      // Read aloud, the sentence has a pause for the blank until the answer is shown, then the answer in it.
      const fillWord = p.base?.meaning ? { text: p.base.word, meaning: p.base.meaning, pos: p.base.pos } : null;
      return `${base || task ? `<div class="cloze-head">${base}${task}</div>` : ''}
        <p class="${sentenceClass(card)}" lang="${lang}">${sentenceHTML(p.sentence, ctx.revealed ? card.answer.accepted[0] : null, p.words || [], fillWord)}${speakButton(ctx, ctx.revealed ? p.sentence.replace(BLANK, card.answer.accepted[0]) : p.sentence, lang, { main: true })}</p>
        ${aidsBlock(card, ctx)}`;
    },
    input: textInput,
    back(card, result, input, ctx) {
      const t = ctx.t;
      const a = card.answer;
      const lang = card.language;
      return `
        <div class="answer-grid">
          <div class="answer-row"><div class="label">${t.yourAnswer}</div><p class="val mine big v-${result.verdict}" lang="${lang}">${typedHTML(card, input)}</p></div>
          <div class="answer-row"><div class="label">${t.model}</div><p class="val big" lang="${lang}">${a.accepted.map(rubyHTML).join('　／　')}${speakButton(ctx, a.accepted[0], lang, { word: true })}</p></div>
        </div>
        ${acceptableBlock(card, ctx, result)}
        ${chipsBlock(card, ctx)}
        ${explanationBlock(card, ctx)}`;
    },
    summary(card, ctx) {
      const p = card.prompt;
      const lang = card.language;
      const task = loc(p.task, [ctx.L.noteLang]);
      const head = p.base?.word ? `<span lang="${lang}">${rubyHTML(p.base.word)}</span> ` : '';
      const tr = loc(p.translation, [ctx.L.noteLang]);
      return `<div class="sum-main">${head}${registerChip(card, ctx, ' tiny')}${task ? `<span class="form-chip tiny">${esc(task)}</span>` : ''}${!head && !task ? `<span lang="${lang}">${sentenceHTML(p.sentence, card.answer.accepted[0])}</span>` : ''}</div>
        <div class="sum-sub">${head || task ? `<span lang="${lang}">${sentenceHTML(p.sentence, card.answer.accepted[0])}</span> ` : ''}${tr ? `<span class="muted">${esc(tr)}</span>` : ''}</div>`;
    },
  },

  flip: {
    flip: true,
    front(card, ctx) {
      const p = card.prompt;
      const reading = toKana(p.word);
      return `<div class="eyebrow">${ctx.t.vocabFront}</div>
        <div class="vocab-word${ctx.revealed ? '' : ' peek'}" lang="${card.language}">${rubyHTML(p.word)}${ctx.revealed ? speakButton(ctx, p.word, card.language, { main: true, word: true }) : ''}</div>
        ${ctx.revealed && (ctx.L.pitch || reading !== toSurface(p.word)) ? readingHTML(p.word, card.language, 'vocab-reading', { dir: ctx.L.pitch, hidden: reading === toSurface(p.word) }) : ''}
        ${ctx.homograph && p.example && !ctx.revealed ? `<p class="vocab-context" lang="${card.language}">${sentenceHTML(p.example)}</p>` : ''}
        ${ctx.revealed || reading === toSurface(p.word) ? '' : `<p class="hint">${ctx.t.vocabPeek}</p>`}`;
    },
    input() { return ''; },
    back(card, result, input, ctx) {
      const p = card.prompt;
      const t = ctx.t;
      return `
        <div class="answer-row"><div class="label">${t.meaning}</div><p class="val big vocab-meaning" lang="${ctx.L.noteLang}">${esc(card.answer.accepted.join('；'))}</p></div>
        ${p.pos ? `<div class="chips"><span class="group-chip">${esc(p.pos)}</span></div>` : ''}
        ${p.example ? `<section class="explain"><h4>${t.example}</h4>
          <p class="example" lang="${card.language}">${sentenceHTML(p.example, null, p.words || [])}${speakButton(ctx, p.example, card.language)}</p>
          ${aidsBlock(card, ctx, { translation: p.exampleTranslation, hint: null })}</section>` : ''}
        ${explanationBlock(card, ctx)}`;
    },
    summary(card, ctx) {
      const p = card.prompt;
      return `<div class="sum-main"><span lang="${card.language}" class="sum-word">${rubyHTML(p.word)}</span> ${p.pos ? `<span class="form-chip tiny">${esc(p.pos)}</span>` : ''}</div>
        <div class="sum-sub" lang="${ctx.L.noteLang}">${esc(card.answer.accepted.join('；'))}</div>`;
    },
  },

  // A sentence to learn as a whole: read it (or listen), recall what it means, grade yourself.
  // answer.accepted holds its translations in the note language, the main one first.
  sentence: {
    flip: true,
    front(card, ctx) {
      const p = card.prompt;
      return `<div class="eyebrow">${ctx.t.sentenceFront}</div>
        <p class="${sentenceClass(card)}" lang="${card.language}">${sentenceHTML(p.sentence, null, p.words || [])}${speakButton(ctx, p.sentence, card.language, { main: true })}</p>
        ${ctx.revealed ? '' : `<p class="hint">${ctx.t.sentencePeek}</p>`}`;
    },
    input() { return ''; },
    back(card, result, input, ctx) {
      const [main, ...more] = card.answer.accepted;
      return `
        <div class="answer-row"><div class="label">${ctx.t.translation}</div>
          <p class="val big sentence-translation" lang="${ctx.L.noteLang}">${esc(main)}</p>
          ${more.map((x) => `<p class="val muted" lang="${ctx.L.noteLang}">${esc(x)}</p>`).join('')}</div>
        ${explanationBlock(card, ctx)}`;
    },
    summary(card, ctx) {
      return `<div class="sum-main"><span lang="${card.language}">${sentenceHTML(card.prompt.sentence)}</span></div>
        <div class="sum-sub" lang="${ctx.L.noteLang}">${esc(card.answer.accepted[0])}</div>`;
    },
  },
};

export const rendererFor = (card) => CARD_RENDERERS[typeOf(card)] || CARD_RENDERERS.cloze;
