// Languages, topics, and how each topic's cards are drawn.
import { esc, loc, rubyHTML, sentenceHTML, isRomaji, romajiToHiragana } from './text.js';
import { wordDiff } from './check.js';

export const LANGS = {
  de: { label: 'Deutsch', htmlLang: 'de', topics: [{ id: 'nominalisierung', label: 'Nominalisierung' }] },
  ja: { label: '日本語', htmlLang: 'zh-Hant', topics: [{ id: 'verb-conjugation', label: '動詞變化' }] },
};

const EXPLAIN_LANGS = [['de', 'DE'], ['en', 'EN'], ['zh-Hant', '中文']];

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

function explanationBlock(card, ctx, langs) {
  const ex = card.explanation;
  if (!ex) return '';
  if (typeof ex === 'string' || !langs) {
    return `<section class="explain"><h4>${ctx.t.explanation}</h4><p>${esc(loc(ex, ['zh-Hant', 'de']))}</p></section>`;
  }
  const available = langs.filter(([k]) => ex[k]);
  const cur = available.some(([k]) => k === ctx.settings.explainLang) ? ctx.settings.explainLang : available[0]?.[0];
  return `<section class="explain">
    <div class="explain-head"><h4>${ctx.t.explanation}</h4>
      <div class="seg small" role="tablist">${available.map(([k, l]) => `<button type="button" role="tab" data-explain="${k}" aria-selected="${k === cur}">${l}</button>`).join('')}</div>
    </div>
    <p lang="${cur}">${esc(ex[cur] || '')}</p></section>`;
}

const noteHTML = (note, lang) => (note ? `<p class="note" lang="${lang}">${esc(loc(note, [lang]))}</p>` : '');

export const RENDERERS = {
  nominalisierung: {
    front(card, ctx) {
      const p = card.prompt;
      return `<div class="eyebrow">${ctx.t.verbalstil}</div>
        <p class="prompt-sentence" lang="de">${esc(p.verbalstil)}</p>
        <div class="aids">
          ${aid(ctx, 'hint', ctx.t.tip, 'de', p.hint)}
          ${aid(ctx, 'en', 'EN', 'en', loc(p.translation?.en))}
          ${aid(ctx, 'zh', '中文', 'zh-Hant', p.translation?.['zh-Hant'])}
        </div>`;
    },
    input(card, ctx) {
      return `<label class="eyebrow" for="answer">${ctx.t.nominalstil}</label>
        <textarea id="answer" lang="de" rows="3" spellcheck="false" autocomplete="off" autocapitalize="off" placeholder="${esc(ctx.t.placeholder)}"></textarea>`;
    },
    back(card, result, input, ctx) {
      const t = ctx.t;
      const a = card.answer;
      const target = result.target || a.accepted[0];
      let mine;
      let model;
      if (result.verdict === 'correct') {
        mine = esc(input.trim());
        model = '';
      } else {
        const strip = (x) => x.trim().replace(/[.!?]+$/, '');
        const d = wordDiff(strip(input), strip(target));
        // Only mark word differences when the two sentences mostly overlap; otherwise it is noise.
        const overlap = d.theirs.filter((x) => x.same).length / Math.max(1, d.theirs.length);
        const mark = overlap >= 0.4;
        mine = input.trim() ? (mark ? joinTokens(d.mine, (x) => (x.same ? esc(x.t) : `<del>${esc(x.t)}</del>`)) : esc(input.trim())) : '—';
        model = mark ? joinTokens(d.theirs, (x) => (x.same ? esc(x.t) : `<ins>${esc(x.t)}</ins>`)) : esc(target);
      }
      const others = a.accepted.filter((x) => x !== target && x !== result.matched);
      return `
        <div class="answer-row"><div class="label">${t.yourAnswer}</div><p class="val mine v-${result.verdict}" lang="de">${mine}</p></div>
        ${model ? `<div class="answer-row"><div class="label">${t.model}</div><p class="val model" lang="de">${model}</p></div>` : ''}
        ${others.length ? `<div class="answer-row"><div class="label">${t.alsoCorrect}</div><ul class="alts" lang="de">${others.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}
        ${a.acceptable?.length ? `<div class="answer-row"><div class="label">${t.okButNot}</div><ul class="alts meh" lang="de">${a.acceptable.map((x) => `<li>${esc(x.text)}${noteHTML(x.note, 'de')}</li>`).join('')}</ul></div>` : ''}
        ${explanationBlock(card, ctx, EXPLAIN_LANGS)}`;
    },
    summary(card) {
      return `<div class="sum-main" lang="de">${esc(card.prompt.verbalstil)}</div>
        <div class="sum-sub" lang="de">→ ${esc(card.answer.accepted[0])}</div>`;
    },
    noteLang: 'de',
  },

  'verb-conjugation': {
    front(card, ctx) {
      const p = card.prompt;
      const t = ctx.t;
      const showForm = ctx.settings.showForm || ctx.revealed || ctx.aids.has('form');
      const form = p.formLabel
        ? showForm
          ? `<div class="form-chip" lang="ja">${esc(p.formLabel)}</div>`
          : `<button type="button" class="form-chip ghost" data-action="show-form">${t.showFormBtn}</button>`
        : '';
      return `<div class="ja-head">
          <div class="verb-block">
            <div class="eyebrow">${t.dictForm}</div>
            <div class="verb" lang="ja">${rubyHTML(p.verb)}</div>
            <div class="meaning">${esc(p.meaning)}</div>
          </div>
          ${form}
        </div>
        <p class="prompt-sentence ja" lang="ja">${sentenceHTML(p.sentence, ctx.revealed ? card.answer.accepted[0] : null)}</p>
        <p class="translation">${esc(loc(p.translation, ['zh-Hant']))}</p>`;
    },
    input(card, ctx) {
      return `<input id="answer" lang="ja" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="${esc(ctx.t.placeholder)}">
        <div id="kana-preview" class="kana-preview" lang="ja" aria-live="polite"></div>`;
    },
    back(card, result, input, ctx) {
      const t = ctx.t;
      const a = card.answer;
      const group = card.meta?.verbClass ? `<span class="group-chip">${esc(t.groups[card.meta.verbClass] || card.meta.verbClass)}</span>` : '';
      return `
        <div class="answer-grid">
          <div class="answer-row"><div class="label">${t.yourAnswer}</div><p class="val mine big v-${result.verdict}" lang="ja">${!input.trim() ? '—' : isRomaji(input.trim()) ? `${esc(romajiToHiragana(input.trim()))} <span class="muted small">(${esc(input.trim())})</span>` : esc(input.trim())}</p></div>
          <div class="answer-row"><div class="label">${t.model}</div><p class="val big" lang="ja">${a.accepted.map(rubyHTML).join('　／　')}</p></div>
        </div>
        ${a.acceptable?.length ? `<div class="answer-row"><div class="label">${t.okButNot}</div><ul class="alts meh">${a.acceptable.map((x) => `<li><span lang="ja">${rubyHTML(x.text)}</span>${noteHTML(x.note, 'zh-Hant')}</li>`).join('')}</ul></div>` : ''}
        <div class="chips">${group}</div>
        ${explanationBlock(card, ctx, null)}`;
    },
    summary(card, ctx) {
      const p = card.prompt;
      return `<div class="sum-main"><span lang="ja">${rubyHTML(p.verb)}</span> <span class="form-chip tiny" lang="ja">${esc(p.formLabel || '')}</span></div>
        <div class="sum-sub"><span lang="ja">${sentenceHTML(p.sentence, card.answer.accepted[0])}</span> <span class="muted">${esc(loc(p.translation, ['zh-Hant']))}</span></div>`;
    },
    noteLang: 'zh-Hant',
  },
};
