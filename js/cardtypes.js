// Card types: how a card is drawn. Topics pick a type in js/topics.js, so a new topic needs no code here.
//
//   rewrite  rewrite a whole sentence (prompt.source → typed sentence), e.g. Nominalisierung
//   cloze    fill the blank (___) in prompt.sentence, optionally from a base word, e.g. 動詞變化, 助詞
//   flip     classic Anki card: see the front, recall the back, grade yourself (word list)
//
// Shared by every type: prompt.words (hoverable words), prompt.hint, prompt.translation, prompt.task,
// card.explanation (tabs for each language it has) and chips for card.meta values named in the topic's facets.
//
// Each renderer gets a `ctx` built by app.js: { t, settings, aids, revealed, L (language config),
// labels (topic labels merged with defaults), facets }.
import { esc, loc, rubyHTML, sentenceHTML, isRomaji, romajiToHiragana, toSurface, toKana, BLANK } from './text.js';
import { wordDiff } from './check.js';
import { typeOf } from './topics.js';

// ---------- word list ----------

export const vocabId = (lang, lemma) => `${lang}-vocab-${toSurface(lemma)}`;

/** The sentence a card's hoverable words live in (prompt.words are matched against it). */
export function sentenceOf(card) {
  const p = card?.prompt || {};
  const type = typeOf(card);
  return type === 'rewrite' ? p.source : type === 'cloze' ? p.sentence : p.example;
}

/** The full sentence of a card (blank filled with the model answer), used as a word's example. */
export function exampleOf(card) {
  const p = card?.prompt;
  const text = sentenceOf(card);
  if (!text) return null;
  const full = typeOf(card) === 'cloze' ? text.replace(BLANK, card.answer.accepted[0]) : text;
  return { text: full, translation: typeOf(card) === 'flip' ? p.exampleTranslation : p.translation };
}

/** Build a word-list card from a hovered word and the card it came from. */
export function vocabCardFrom(word, sourceCard, lang) {
  const ex = sourceCard && sourceCard.topic !== 'vocab' ? exampleOf(sourceCard) : null;
  return {
    id: vocabId(lang, word.lemma),
    language: lang,
    topic: 'vocab',
    source: sourceCard?.source || 'word-list',
    level: sourceCard?.level,
    tags: word.pos ? [word.pos] : [],
    createdAt: new Date().toLocaleDateString('sv-SE'), // local YYYY-MM-DD
    meta: { savedFrom: sourceCard?.id },
    prompt: {
      word: word.lemma,
      pos: word.pos,
      ...(ex ? { example: ex.text, exampleTranslation: ex.translation } : {}),
    },
    answer: { accepted: [word.meaning] },
  };
}

// ---------- shared blocks ----------

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

/** Translation and hint. Beginner languages show the main translation; the rest sit behind a click. */
function aidsBlock(card, ctx) {
  const p = card.prompt;
  const tr = typeof p.translation === 'string' ? { [ctx.L.noteLang]: p.translation } : p.translation || {};
  const shown = ctx.L.translation === 'always' && tr[ctx.L.noteLang] ? ctx.L.noteLang : null;
  const hidden = Object.keys(tr).filter((k) => k !== shown && k !== card.language && tr[k]);
  const aids = [
    aid(ctx, 'hint', ctx.t.tip, ctx.L.noteLang, loc(p.hint, [ctx.L.noteLang])),
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

const noteHTML = (note, lang) => (note ? `<p class="note" lang="${lang}">${esc(loc(note, [lang]))}</p>` : '');

/** The learner's answer as typed (romaji also shown as kana for Japanese). */
function typedHTML(card, input) {
  const v = input.trim();
  if (!v) return '—';
  if (card.language === 'ja' && isRomaji(v)) return `${esc(romajiToHiragana(v))} <span class="muted small">(${esc(v)})</span>`;
  return esc(v);
}

function acceptableBlock(card, ctx) {
  const a = card.answer;
  if (!a.acceptable?.length) return '';
  return `<div class="answer-row"><div class="label">${ctx.t.okButNot}</div><ul class="alts meh" lang="${card.language}">${a.acceptable
    .map((x) => `<li>${rubyHTML(x.text)}${noteHTML(x.note, ctx.L.noteLang)}</li>`).join('')}</ul></div>`;
}

const textInput = (card, ctx) => `<input id="answer" lang="${card.language}" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="${esc(ctx.labels.placeholder)}">
  ${card.language === 'ja' ? '<div id="kana-preview" class="kana-preview" lang="ja" aria-live="polite"></div>' : ''}`;

const sentenceClass = (card) => `prompt-sentence${card.language === 'ja' ? ' ja' : ''}`;

// ---------- types ----------

export const CARD_RENDERERS = {
  rewrite: {
    multiline: true,
    front(card, ctx) {
      const p = card.prompt;
      return `<div class="eyebrow">${esc(ctx.labels.source)}</div>
        <p class="${sentenceClass(card)}" lang="${card.language}">${sentenceHTML(p.source, null, p.words || [])}</p>
        ${p.task ? `<div class="task-row">${taskChip(card, ctx)}</div>` : ''}
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
      return `
        <div class="answer-row"><div class="label">${t.yourAnswer}</div><p class="val mine v-${result.verdict}" lang="${lang}">${mine}</p></div>
        ${model ? `<div class="answer-row"><div class="label">${t.model}</div><p class="val model" lang="${lang}">${model}</p></div>` : ''}
        ${others.length ? `<div class="answer-row"><div class="label">${t.alsoCorrect}</div><ul class="alts" lang="${lang}">${others.map((x) => `<li>${rubyHTML(x)}</li>`).join('')}</ul></div>` : ''}
        ${acceptableBlock(card, ctx)}
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
            <div class="base-word" lang="${lang}">${rubyHTML(p.base.word)}</div>
            ${p.base.meaning ? `<div class="meaning" lang="${ctx.L.noteLang}">${esc(p.base.meaning)}</div>` : ''}
          </div>`
        : '';
      const task = taskChip(card, ctx);
      // The filled-in answer is hoverable as the base word (e.g. 食べない → 食べる).
      const fillWord = p.base?.meaning ? { text: p.base.word, meaning: p.base.meaning, pos: p.base.pos } : null;
      return `${base || task ? `<div class="cloze-head">${base}${task}</div>` : ''}
        <p class="${sentenceClass(card)}" lang="${lang}">${sentenceHTML(p.sentence, ctx.revealed ? card.answer.accepted[0] : null, p.words || [], fillWord)}</p>
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
          <div class="answer-row"><div class="label">${t.model}</div><p class="val big" lang="${lang}">${a.accepted.map(rubyHTML).join('　／　')}</p></div>
        </div>
        ${acceptableBlock(card, ctx)}
        ${chipsBlock(card, ctx)}
        ${explanationBlock(card, ctx)}`;
    },
    summary(card, ctx) {
      const p = card.prompt;
      const lang = card.language;
      const task = loc(p.task, [ctx.L.noteLang]);
      const head = p.base?.word ? `<span lang="${lang}">${rubyHTML(p.base.word)}</span> ` : '';
      const tr = loc(p.translation, [ctx.L.noteLang]);
      return `<div class="sum-main">${head}${task ? `<span class="form-chip tiny">${esc(task)}</span>` : ''}${!head && !task ? `<span lang="${lang}">${sentenceHTML(p.sentence, card.answer.accepted[0])}</span>` : ''}</div>
        <div class="sum-sub">${head || task ? `<span lang="${lang}">${sentenceHTML(p.sentence, card.answer.accepted[0])}</span> ` : ''}${tr ? `<span class="muted">${esc(tr)}</span>` : ''}</div>`;
    },
  },

  flip: {
    flip: true,
    front(card, ctx) {
      const p = card.prompt;
      const reading = toKana(p.word);
      return `<div class="eyebrow">${ctx.t.vocabFront}</div>
        <div class="vocab-word${ctx.revealed ? '' : ' peek'}" lang="${card.language}">${rubyHTML(p.word)}</div>
        ${ctx.revealed && reading !== toSurface(p.word) ? `<div class="vocab-reading" lang="${card.language}">${esc(reading)}</div>` : ''}
        ${ctx.revealed || reading === toSurface(p.word) ? '' : `<p class="hint">${ctx.t.vocabPeek}</p>`}`;
    },
    input() { return ''; },
    back(card, result, input, ctx) {
      const p = card.prompt;
      const t = ctx.t;
      return `
        <div class="answer-row"><div class="label">${t.meaning}</div><p class="val big">${esc(card.answer.accepted.join('；'))}</p></div>
        ${p.pos ? `<div class="chips"><span class="group-chip">${esc(p.pos)}</span></div>` : ''}
        ${p.example ? `<section class="explain"><h4>${t.example}</h4>
          <p class="example" lang="${card.language}">${sentenceHTML(p.example, null, p.words || [])}</p>
          <p lang="${ctx.L.noteLang}">${esc(loc(p.exampleTranslation, [ctx.L.noteLang]))}</p></section>` : ''}
        ${explanationBlock(card, ctx)}`;
    },
    summary(card) {
      const p = card.prompt;
      return `<div class="sum-main"><span lang="${card.language}" class="sum-word">${rubyHTML(p.word)}</span> ${p.pos ? `<span class="form-chip tiny">${esc(p.pos)}</span>` : ''}</div>
        <div class="sum-sub">${esc(card.answer.accepted.join('；'))}</div>`;
    },
  },
};

export const rendererFor = (card) => CARD_RENDERERS[typeOf(card)] || CARD_RENDERERS.cloze;
