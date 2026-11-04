import * as store from './store.js';
import { answer, preview, DEFAULTS, dayStartMs, isNew, isLearning, isReviewDue, learningDueToday } from './srs.js';
import { checkAnswer } from './check.js';
import { UI } from './i18n.js';
import { LANGS, topicOf, topicType, ancestry, childrenOf, groupOf, labelsOf, facetsOf, vocabTopic } from './topics.js';
import { rendererFor, vocabId, vocabCardFrom, speakButton } from './cardtypes.js';
import * as speech from './speech.js';
import { esc, loc, isRomaji, romajiToHiragana, rubyHTML, toKana, toSurface } from './text.js';
import { emptyValues, valuesFromCard, cardFromValues, formErrors, missingFurigana, formLangs, makeId, USER_SOURCE } from './cardform.js';

const $ = (sel, el = document) => el.querySelector(sel);
const GRADES = ['again', 'hard', 'good', 'easy'];
const SUGGEST = { correct: 'good', acceptable: 'hard', close: 'hard', mistake: 'again', wrong: 'again', empty: 'again', flip: 'good' };

const ICON = {
  edit: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4ZM13.5 6.5l4 4"/></svg>',
  plus: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M12 5v14M5 12h14"/></svg>',
  trash: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" d="M4 7h16M10 11v6M14 11v6M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/></svg>',
};

const state = { lang: 'de', topic: 'nominalisierung', view: 'learn', sessions: {}, loadError: false, flash: '', menuOpen: false };

const t = () => UI[state.lang];
const settings = () => store.getSettings();
const key = () => `${state.lang}/${state.topic}`;
const session = () => state.sessions[key()] || null;
const currentCard = () => { const s = session(); return s?.current ? store.getCard(s.current) : null; };
const cfg = () => ({ ...DEFAULTS, newPerDay: settings().newPerDay, reviewsPerDay: settings().reviewsPerDay });
let waitTimer = null;

// ---------- speech (read sentences aloud, see js/speech.js) ----------

const speechLocale = (lang) => LANGS[lang]?.speech?.locale;
const speechOn = (lang) => speech.canSpeak(speechLocale(lang));
const speechOpts = (lang) => {
  const own = settings().speech[lang] || {};
  return { locale: speechLocale(lang), voiceURI: own.voice, rate: own.rate ?? LANGS[lang].speech.rate ?? 1 };
};

/** Play a [data-speak] button; pressing the one that is playing stops it. */
function playSpeakButton(btn) {
  const wasPlaying = btn.classList.contains('speaking');
  speech.stop();
  if (wasPlaying) return;
  const lang = btn.dataset.speakLang;
  btn.classList.add('speaking');
  const ok = speech.speak(btn.dataset.speak, { ...speechOpts(lang), onEnd: () => btn.classList.remove('speaking') });
  if (!ok) btn.classList.remove('speaking');
}

// Voices arrive after the page loads (and can change when the OS installs one): redraw if that
// turns the speaker buttons on or off.
let speechSeen = '';
speech.onVoicesChanged(() => {
  const now = Object.keys(LANGS).map((l) => `${l}:${speechOn(l)}`).join();
  if ($('#dlg-settings')?.open) openSettings();
  if (now === speechSeen) return;
  speechSeen = now;
  if (!document.querySelector('dialog[open]')) render();
});

// ---------- routing ----------

function parseHash() {
  const [, lang, topic, view] = location.hash.split('/');
  if (LANGS[lang]) {
    state.lang = lang;
    state.topic = topicOf(lang, topic) ? topic : LANGS[lang].topics[0].id;
    state.view = view === 'cards' ? 'cards' : 'learn';
  }
}
function go(lang, topic, view) {
  location.hash = `#/${lang}/${topic}/${view}`;
}
window.addEventListener('hashchange', () => { parseHash(); try { localStorage.setItem('gk.route', location.hash); } catch {} render(); });

// ---------- mobile topic menu ----------

const mobileQuery = window.matchMedia('(max-width: 760px)');

function setMenu(open) {
  state.menuOpen = open && mobileQuery.matches;
  document.body.classList.toggle('menu-open', state.menuOpen);
  $('#btn-menu')?.setAttribute('aria-expanded', String(state.menuOpen));
  const scrim = $('.scrim');
  if (scrim) scrim.hidden = !state.menuOpen;
  // Closed drawer must not be reachable with Tab on mobile.
  $('#sidebar')?.toggleAttribute('inert', mobileQuery.matches && !state.menuOpen);
}
mobileQuery.addEventListener('change', () => setMenu(false));

// ---------- word popup (hover a word in a Japanese sentence → save it to the word list) ----------

let popWord = null; // the .word element the popup belongs to
let popHideTimer = null;
const pop = () => $('#word-pop');

function markSavedWords() {
  for (const el of document.querySelectorAll('.word[data-word]')) {
    const w = JSON.parse(el.dataset.word);
    el.classList.toggle('saved', !!store.getCard(vocabId(state.lang, w.lemma)));
  }
}

function renderPop(w) {
  const T = t();
  const lang = state.lang;
  const saved = !!store.getCard(vocabId(lang, w.lemma));
  const reading = toKana(w.lemma);
  // Words can be saved only in a course that has a word list.
  const actions = !vocabTopic(lang) ? '' : saved
    ? `<span class="pop-saved">✓ ${T.inWordList}</span><button type="button" class="link" data-action="vocab-remove">${T.remove}</button>`
    : `<button type="button" class="btn primary small" data-action="vocab-add">＋ ${T.addToWordList}</button>`;
  pop().innerHTML = `
    <div class="pop-word" lang="${lang}">${rubyHTML(w.lemma)}${speakButton({ t: T, speak: speechOn(lang) }, w.lemma, lang)}</div>
    ${reading !== toSurface(w.lemma) ? `<div class="pop-reading" lang="${lang}">${esc(reading)}</div>` : ''}
    <div class="pop-meaning" lang="${LANGS[lang].noteLang}">${esc(w.meaning)}</div>
    ${w.pos ? `<span class="group-chip">${esc(w.pos)}</span>` : ''}
    ${actions ? `<div class="pop-actions">${actions}</div>` : ''}`;
}

function showPop(el) {
  clearTimeout(popHideTimer);
  const box = pop();
  if (popWord === el && !box.hidden) return;
  popWord?.classList.remove('active');
  popWord = el;
  el.classList.add('active');
  renderPop(JSON.parse(el.dataset.word));
  box.hidden = false;
  const r = el.getBoundingClientRect();
  const w = box.offsetWidth;
  const h = box.offsetHeight;
  const left = Math.min(Math.max(8, r.left + r.width / 2 - w / 2), innerWidth - w - 8);
  const below = r.bottom + 8 + h <= innerHeight;
  box.style.left = `${left + scrollX}px`;
  box.style.top = `${(below ? r.bottom + 8 : r.top - h - 8) + scrollY}px`;
}

function hidePop() {
  clearTimeout(popHideTimer);
  const box = pop();
  if (box) box.hidden = true;
  popWord?.classList.remove('active');
  popWord = null;
}
const hidePopSoon = () => { clearTimeout(popHideTimer); popHideTimer = setTimeout(hidePop, 300); };

function toggleSavedWord(add) {
  if (!popWord) return;
  const w = JSON.parse(popWord.dataset.word);
  if (add) {
    const source = store.getCard(popWord.closest('[data-card]')?.dataset.card);
    store.saveCard(vocabCardFrom(w, source, state.lang));
  } else {
    store.deleteCard(vocabId(state.lang, w.lemma));
  }
  renderPop(w);
  markSavedWords();
  renderSidebar(); // update the word-list count without re-rendering the card
}

const canHover = window.matchMedia('(hover: hover) and (pointer: fine)');
document.addEventListener('mouseover', (e) => {
  if (!canHover.matches) return;
  const w = e.target.closest('.word[data-word]');
  if (w) showPop(w);
  else if (e.target.closest('#word-pop')) clearTimeout(popHideTimer);
});
document.addEventListener('mouseout', (e) => {
  if (!canHover.matches || !popWord) return;
  const to = e.relatedTarget;
  if (to && (to.closest?.('#word-pop') || to.closest?.('.word') === popWord)) return;
  if (e.target.closest('.word[data-word], #word-pop')) hidePopSoon();
});
document.addEventListener('focusin', (e) => {
  const w = e.target.closest('.word[data-word]');
  if (w) showPop(w);
  else if (popWord && !e.target.closest('#word-pop')) hidePop();
});
window.addEventListener('resize', hidePop);
window.addEventListener('scroll', () => { if (popWord && !canHover.matches) hidePop(); }, { passive: true });

// ---------- counts ----------

function counts(lang, topic) {
  const cards = store.cardsFor(lang, topic);
  const now = Date.now();
  let learn = 0;
  let review = 0;
  let fresh = 0;
  for (const c of cards) {
    const p = store.getProgress(c.id);
    if (isNew(p)) fresh++;
    else if (isLearning(p)) { if (learningDueToday(p, now)) learn++; }
    else if (isReviewDue(p, now)) review++;
  }
  const S = settings();
  // A deck's limits also cap its sub-decks: answers count for the card's topic and every parent.
  const left = (limit, kind) => Math.min(...ancestry(lang, topic).map((tp) => Math.max(0, limit - store.dailyCount(lang, tp.id, kind))));
  const reviewLeft = left(S.reviewsPerDay, 'review');
  const reviewToday = Math.min(review, reviewLeft);
  const newLeft = left(S.newPerDay, 'new');
  // As in Anki's v3 scheduler, the review limit also caps new cards.
  const newToday = Math.min(fresh, newLeft, Math.max(0, reviewLeft - reviewToday));
  return { total: cards.length, learn, review: reviewToday, fresh, newToday };
}

/** Learning/relearning cards of this topic due before the day ends, soonest first. */
function topicLearning() {
  const now = Date.now();
  return store.cardsFor(state.lang, state.topic)
    .map((c) => ({ id: c.id, st: store.getProgress(c.id) }))
    .filter((x) => learningDueToday(x.st, now))
    .sort((a, b) => a.st.due - b.st.due);
}

/** Anki's order: due learning cards first, then the day's reviews/new cards, then learn ahead (20 min). */
function pickNext(s) {
  if (s.mode === 'cram') {
    while (s.queue.length && !store.getCard(s.queue[0])) s.queue.shift();
    return s.queue[0] || null;
  }
  const now = Date.now();
  const learning = topicLearning();
  if (learning[0] && learning[0].st.due <= now) return learning[0].id;
  s.queue = s.queue.filter((id) => {
    const st = store.getProgress(id);
    return store.getCard(id) && (isNew(st) || isReviewDue(st, now));
  });
  if (s.queue.length) return s.queue[0];
  if (learning[0] && learning[0].st.due <= now + DEFAULTS.learnAheadMins * 60000) return learning[0].id;
  return null;
}

function mixIn(reviews, news) {
  const out = [];
  let r = 0;
  news.forEach((n, i) => {
    const upTo = Math.round(((i + 1) * reviews.length) / (news.length + 1));
    while (r < upTo) out.push(reviews[r++]);
    out.push(n);
  });
  while (r < reviews.length) out.push(reviews[r++]);
  return out;
}

// ---------- render ----------

/** One topic in the sidebar, with its sub-topics below it (foldable). */
function sideItem(tp) {
  const lang = state.lang;
  const kids = childrenOf(lang, tp.id);
  const key = `${lang}/${tp.id}`;
  // A folded topic still opens while one of its sub-topics is the current page.
  const open = !settings().collapsed.includes(key) || ancestry(lang, state.topic).slice(1).some((x) => x.id === tp.id);
  const T = t();
  const caret = kids.length
    ? `<button type="button" class="side-caret" data-toggle-topic="${tp.id}" aria-expanded="${open}" aria-label="${esc(open ? T.collapse : T.expand)}" title="${esc(open ? T.collapse : T.expand)}">
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="m6 4 4 4-4 4"/></svg></button>`
    : '';
  return `<div class="side-node${kids.length ? ' has-kids' : ''}">
      <div class="side-row">
        <button class="side-item" data-topic="${tp.id}" ${tp.id === state.topic ? 'aria-current="page"' : ''}>
          <span class="side-label">${esc(tp.label)}</span><span class="badge">${counts(lang, tp.id).total}</span></button>
        ${caret}
      </div>
      ${kids.length && open ? `<div class="side-kids" role="group">${kids.map(sideItem).join('')}</div>` : ''}
    </div>`;
}

function renderSidebar() {
  const roots = childrenOf(state.lang, null);
  const groups = [...new Set(roots.map((tp) => groupOf(state.lang, tp.id)))];
  $('#sidebar').innerHTML = groups.map((g) => `
    <div class="side-group">
      <div class="side-title">${esc(t().groups[g])}</div>
      <nav class="side-nav" aria-label="${esc(t().groups[g])}">
        ${roots.filter((tp) => groupOf(state.lang, tp.id) === g).map(sideItem).join('')}
      </nav>
    </div>`).join('');
}

// ---------- language menu ----------

function renderLangMenu() {
  const cur = LANGS[state.lang];
  $('#lang-btn').innerHTML = `<span class="lang-glyph" data-glyph="${state.lang}">${esc(cur.glyph)}</span>
    <span class="lang-name" lang="${state.lang}">${esc(cur.label)}</span>
    <svg class="chev" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="m4 6 4 4 4-4"/></svg>`;
  $('#lang-btn').setAttribute('aria-label', `${t().langMenu}: ${cur.label}`);
  $('#lang-list').setAttribute('aria-label', t().langMenu);
  $('#lang-list').innerHTML = Object.entries(LANGS).map(([id, L]) => `
    <button type="button" role="menuitemradio" class="lang-opt" data-lang-switch="${id}" aria-checked="${id === state.lang}" tabindex="-1">
      <span class="lang-glyph" data-glyph="${id}">${esc(L.glyph)}</span>
      <span class="lang-text"><span class="lang-opt-name" lang="${id}">${esc(L.label)}</span><span class="lang-tag" lang="${L.htmlLang}">${esc(L.tagline)}</span></span>
      <svg class="check" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="m3.5 8.5 3 3 6-7"/></svg>
    </button>`).join('');
}

const langMenuOpen = () => !$('#lang-list').hidden;
function setLangMenu(open, focus = 'current') {
  const list = $('#lang-list');
  list.hidden = !open;
  $('#lang-btn').setAttribute('aria-expanded', String(open));
  if (open) {
    const items = [...list.querySelectorAll('.lang-opt')];
    const cur = items.find((x) => x.getAttribute('aria-checked') === 'true') || items[0];
    (focus === 'last' ? items.at(-1) : cur).focus();
  }
}

// ---------- theme ----------

function applyTheme() {
  const theme = settings().theme;
  if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;
  else delete document.documentElement.dataset.theme;
}

function render() {
  hidePop();
  const L = LANGS[state.lang];
  document.documentElement.lang = L.htmlLang;
  document.body.dataset.lang = state.lang;
  document.body.classList.toggle('no-furigana', !settings().furigana);
  const topicLabel = topicOf(state.lang, state.topic)?.label;
  const parents = ancestry(state.lang, state.topic).slice(1).reverse();
  document.title = `${topicLabel.replace(/\u00AD/g, '')} · ${state.lang === 'ja' ? 'グラマティック完璧' : 'Grammatik Kanpeki'}`;
  const brand = $('#brand');
  brand.href = `#/${state.lang}/${L.topics[0].id}/learn`;
  brand.innerHTML = state.lang === 'ja'
    ? '<span lang="ja">グラマティック</span><span class="brand-2" lang="ja">完璧</span>'
    : '<span lang="de">Grammatik</span> <span class="brand-2" lang="de">Kanpeki</span>';
  setMenu(state.menuOpen);

  renderLangMenu();
  $('#btn-data .btn-label').textContent = t().importExport;
  $('#btn-data').setAttribute('aria-label', t().importExport);
  $('#btn-data').title = t().importExport;
  $('#btn-settings').title = t().settings;
  $('#btn-settings').setAttribute('aria-label', t().settings);

  renderSidebar();
  $('#btn-menu').setAttribute('aria-label', t().menu);

  $('#content-head').innerHTML = `
    <div class="head-title">
      ${parents.length ? `<nav class="crumbs">${parents.map((x) => `<button type="button" class="link" data-topic="${x.id}">${esc(x.label)}</button>`).join('<span aria-hidden="true">›</span>')}</nav>` : ''}
      <h1>${esc(topicLabel)}</h1>
    </div>
    <div class="head-actions">
      <div class="seg" role="tablist">
        <button role="tab" data-view="learn" aria-selected="${state.view === 'learn'}">${t().learn}</button>
        <button role="tab" data-view="cards" aria-selected="${state.view === 'cards'}">${t().cards}</button>
      </div>
      <button type="button" class="btn small add-btn" data-action="add-card" title="${esc(t().form.add)}" aria-label="${esc(t().form.add)}">${ICON.plus}<span class="add-label">${esc(t().form.add)}</span></button>
    </div>`;

  const main = $('#view');
  const banner = state.loadError ? `<div class="banner error">${esc(t().loadError)}</div>` : '';
  if (state.view === 'cards') {
    main.innerHTML = banner + renderCardsView();
    renderCardList();
  } else if (session()) {
    main.innerHTML = banner + renderSession();
    afterSessionRender();
  } else {
    main.innerHTML = banner + renderOverview();
  }
  markSavedWords();
}

function renderOverview() {
  const c = counts(state.lang, state.topic);
  const T = t();
  const any = c.review + c.newToday + c.learn > 0;
  return `<section class="panel overview">
    <h2>${T.todayTitle}</h2>
    <div class="stats">
      <div class="stat new"><span class="num">${c.newToday}</span><span class="lbl">${T.stat.new}</span></div>
      <div class="stat learn"><span class="num">${c.learn}</span><span class="lbl">${T.stat.learn}</span></div>
      <div class="stat due"><span class="num">${c.review}</span><span class="lbl">${T.stat.review}</span></div>
      <div class="stat total"><span class="num">${c.total}</span><span class="lbl">${T.total}</span></div>
    </div>
    <div class="actions">
      <button class="btn primary big" data-action="start" ${any ? '' : 'disabled'}>${T.start}</button>
      <button class="btn" data-action="cram" ${c.total ? '' : 'disabled'}>${T.cram}</button>
      ${c.total ? '' : `<button class="btn primary" data-action="add-card">${esc(T.form.add)}</button>`}
    </div>
    <p class="hint">${!c.total ? (state.topic === 'vocab' ? T.vocabEmpty : T.emptyTopic) : any ? `${T.cram}: ${T.cramHint}` : T.nothingToday}</p>
  </section>`;
}

/** What a card renderer needs; labels and facets come from the card's own topic (it may be a sub-topic). */
function ctx(card, extra = {}) {
  const s = session();
  const lang = card?.language || state.lang;
  return {
    t: UI[lang], settings: settings(), L: LANGS[lang],
    labels: { ...UI[lang].labels, ...labelsOf(lang, card?.topic) },
    facets: facetsOf(lang, card?.topic),
    aids: s?.aids || new Set(), revealed: s?.phase === 'revealed', speak: speechOn(lang), ...extra,
  };
}

function renderSession() {
  const s = session();
  const T = t();
  clearTimeout(waitTimer);
  if (!s.current || !store.getCard(s.current)) s.current = pickNext(s);
  if (!s.current) {
    const next = s.mode === 'review' ? topicLearning()[0] : null;
    if (next) {
      // Nothing to show yet: wait until the next learning card enters the learn-ahead window.
      const wakeAt = next.st.due - DEFAULTS.learnAheadMins * 60000;
      waitTimer = setTimeout(render, Math.max(1000, wakeAt - Date.now() + 500));
      const mins = Math.max(1, Math.ceil((next.st.due - Date.now()) / 60000));
      return `<section class="panel done">
        <h2>${T.waitTitle}</h2><p>${T.waitText(mins)}</p>
        <button class="btn" data-action="end">${T.end}</button></section>`;
    }
    return `<section class="panel done">
      <h2>${T.doneTitle}</h2><p>${T.doneText(s.reviewed)}</p>
      <button class="btn primary" data-action="end">${T.back}</button></section>`;
  }
  const card = store.getCard(s.current);
  const remaining = s.mode === 'cram' ? s.queue.length : s.queue.length + topicLearning().length;
  const R = rendererFor(card);
  const c = ctx(card);
  const sub = card.topic !== state.topic ? topicOf(card.language, card.topic) : null;
  const body = s.phase === 'answer' && R.flip
    ? `<div class="form-actions flip-actions">
        <button type="button" class="btn primary big" data-action="reveal" id="reveal-btn">${T.showAnswer}</button>
      </div>`
    : s.phase === 'answer'
    ? `<form id="answer-form" class="answer-form" autocomplete="off">
        ${R.input(card, c)}
        <div class="form-actions">
          <span class="hint">${R.multiline ? T.enterHint : T.enterHintLine}</span>
          <button type="button" class="btn ghost" data-action="reveal">${T.skip}</button>
          <button type="submit" class="btn primary">${T.check}</button>
        </div>
      </form>`
    : renderReveal(card, c);
  return `<div class="session-bar">
      <span class="pill">${s.mode === 'cram' ? T.cram : T.learn}</span>
      <span class="muted">${remaining} ${T.remaining}</span>
      ${sub ? `<span class="topic-chip">${esc(sub.label)}</span>` : ''}
      <button class="link" data-action="edit-card" data-id="${esc(card.id)}">${T.form.edit}</button>
      <button class="link" data-action="end">${T.end}</button>
    </div>
    <article class="panel card phase-${s.phase}">
      <div class="front" data-card="${esc(card.id)}">${R.front(card, c)}</div>
      ${body}
    </article>`;
}

function renderReveal(card, c) {
  const s = session();
  const T = t();
  const r = s.result;
  const R = rendererFor(card);
  const noteLang = LANGS[card.language].noteLang;
  const suggest = SUGGEST[r.verdict];
  const reason = r.verdict === 'close' ? T.closeReason[r.reason] : '';
  const note = r.note ? loc(r.note, [noteLang]) : reason;
  const ivs = s.mode === 'review' ? preview(store.getProgress(card.id), { cardId: card.id, cfg: cfg() }) : null;
  const iv = (g) => (!ivs ? '' : ivs[g].kind === 'min' ? T.mins(ivs[g].value) : T.days(ivs[g].value));
  const canSave = ['close', 'wrong'].includes(r.verdict) && s.input.trim();
  return `
    ${r.verdict === 'flip' ? '' : `<div class="verdict v-${r.verdict}" role="status">
      <strong>${T.verdict[r.verdict]}</strong>${note ? `<p lang="${noteLang}">${esc(note)}</p>` : ''}
    </div>`}
    <div class="back" data-card="${esc(card.id)}">${R.back(card, r, s.input, c)}</div>
    ${canSave ? `<div class="save-alt">
        <span>${T.saveAs}</span>
        <button type="button" class="chip" data-action="save-accepted">${T.saveAccepted}</button>
        <button type="button" class="chip" data-action="save-acceptable">${T.saveAcceptable}</button>
        <input id="alt-note" class="note-input" placeholder="${esc(T.notePlaceholder)}">
      </div>` : ''}
    ${state.flash ? `<p class="flash">${esc(state.flash)}</p>` : ''}
    <div class="grades">
      ${GRADES.map((g, i) => `<button type="button" class="grade g-${g}${g === suggest ? ' suggested' : ''}" data-grade="${g}">
        <span class="key">${i + 1}</span><span class="name">${T.grades[g]}</span><span class="iv">${iv(g)}</span></button>`).join('')}
    </div>
    <p class="hint center">${T.gradeHint}${c.speak ? ` · ${T.speakKey}` : ''}</p>`;
}

function afterSessionRender() {
  const s = session();
  if (!s || !s.current) return;
  if (s.phase === 'answer') {
    const input = $('#answer');
    if (input) { input.value = s.input; input.focus(); updateKanaPreview(); }
    else $('#reveal-btn')?.focus({ preventScroll: true });
  } else {
    $('.grade.suggested')?.focus({ preventScroll: true });
  }
}

function updateKanaPreview() {
  const el = $('#kana-preview');
  const input = $('#answer');
  if (!el || !input) return;
  const v = input.value.trim();
  el.textContent = v && isRomaji(v) ? `→ ${romajiToHiragana(v)}` : '';
}

// ---------- cards view ----------

function renderCardsView() {
  const T = t();
  const hidden = store.hiddenFor(state.lang, state.topic).length;
  return `<section class="panel list-panel">
    <div class="list-tools">
      <input type="search" id="card-search" placeholder="${esc(T.search)}" value="${esc(state.search || '')}">
      <span class="muted" id="card-count"></span>
      ${hidden ? `<button class="link" data-action="restore">${T.restore(hidden)}</button>` : ''}
    </div>
    <ul class="card-list" id="card-list"></ul>
  </section>`;
}

function renderCardList() {
  const T = t();
  const q = (state.search || '').trim().toLowerCase();
  const cards = store.cardsFor(state.lang, state.topic).filter((c) => !q || JSON.stringify(c).toLowerCase().includes(q));
  const fmt = new Intl.DateTimeFormat(state.lang === 'de' ? 'de-DE' : 'zh-TW', { month: '2-digit', day: '2-digit' });
  $('#card-count').textContent = cards.length;
  $('#card-list').innerHTML = cards.length
    ? cards.map((c) => {
        const p = store.getProgress(c.id);
        const st = isNew(p) ? 'new' : isLearning(p) ? 'learn' : isReviewDue(p) ? 'due' : 'later';
        const label = st === 'later' ? T.status.on(fmt.format(new Date(dayStartMs(p.dueDay)))) : T.status[st];
        return `<li class="card-row">
          <div class="sum">${rendererFor(c).summary(c, ctx(c))}${c.topic !== state.topic ? `<span class="topic-chip">${esc(topicOf(c.language, c.topic)?.label || c.topic)}</span>` : ''}</div>
          <div class="row-meta">
            <span class="status s-${st}">${esc(label)}</span>
            ${p?.leech ? `<span class="status s-leech">${T.leech}</span>` : ''}
            <span class="src" title="${esc(c.id)}">${T.source}: ${esc(c.source === USER_SOURCE ? T.sourceUser : c.source)}</span>
            <span class="row-btns">
            <button class="icon-btn" data-action="edit-card" data-id="${esc(c.id)}" title="${T.form.edit}" aria-label="${T.form.edit}">${ICON.edit}</button>
            <button class="icon-btn" data-action="delete" data-id="${esc(c.id)}" title="${T.del}" aria-label="${T.del}">${ICON.trash}</button>
            </span>
          </div></li>`;
      }).join('')
    : `<li class="empty">${T.emptyList}</li>`;
}

// ---------- session actions ----------

function startSession(mode) {
  const cards = store.cardsFor(state.lang, state.topic);
  let queue;
  if (mode === 'review') {
    const c = counts(state.lang, state.topic);
    const due = cards.filter((x) => isReviewDue(store.getProgress(x.id)))
      .sort((a, b) => store.getProgress(a.id).dueDay - store.getProgress(b.id).dueDay)
      .slice(0, c.review).map((x) => x.id);
    const fresh = cards.filter((x) => isNew(store.getProgress(x.id))).slice(0, c.newToday).map((x) => x.id);
    queue = mixIn(due, fresh);
  } else {
    queue = cards.map((c) => c.id).sort(() => Math.random() - 0.5);
  }
  state.sessions[key()] = { mode, queue, current: null, phase: 'answer', input: '', result: null, reviewed: 0, aids: new Set() };
  render();
}

function submitAnswer(reveal = false) {
  const s = session();
  const card = store.getCard(s.current);
  s.input = $('#answer')?.value ?? '';
  s.result = rendererFor(card).flip ? { verdict: 'flip' } : checkAnswer(card, reveal ? '' : s.input);
  s.phase = 'revealed';
  state.flash = '';
  render();
}

function grade(g) {
  speech.stop();
  const s = session();
  const id = s.current;
  if (s.mode === 'review') {
    const prev = store.getProgress(id);
    const kind = isNew(prev) ? 'new' : prev.type === 'review' ? 'review' : null;
    // Count the answer for the card's own topic and every parent deck, so parent limits cap sub-decks.
    const card = store.getCard(id);
    if (kind) for (const tp of ancestry(state.lang, card?.topic || state.topic)) store.bumpDaily(state.lang, tp.id, kind);
    const next = answer(prev, g, { cardId: id, cfg: cfg() });
    store.setProgress(id, next);
    s.queue = s.queue.filter((x) => x !== id);
    if (next.type === 'review') s.reviewed++;
  } else {
    // "Alle üben": no scheduling; Again puts the card back three cards later.
    s.queue.shift();
    if (g === 'again') s.queue.splice(Math.min(3, s.queue.length), 0, id);
    else s.reviewed++;
  }
  Object.assign(s, { current: null, phase: 'answer', input: '', result: null, aids: new Set() });
  state.flash = '';
  render();
}

function saveAlternative(kind) {
  const s = session();
  const id = s.current;
  let text = s.input.trim();
  if (state.lang === 'ja' && isRomaji(text)) text = romajiToHiragana(text);
  const note = $('#alt-note')?.value.trim();
  const card = store.addAlternative(id, text, kind, note);
  if (!card) return;
  s.result = checkAnswer(card, s.input);
  state.flash = t().saved;
  render();
}

// ---------- dialogs ----------

function openDataDialog() {
  const T = t();
  const n = (lang, topic) => (topic ? store.cardsFor(lang, topic) : store.allCards().filter((c) => !lang || c.language === lang)).length;
  const dlg = $('#dlg-data');
  dlg.innerHTML = `<form method="dialog" class="dlg">
    <header><h2>${T.importExport}</h2><button class="icon-btn" value="close" aria-label="${T.close}">✕</button></header>
    <section>
      <h3>${T.exportTitle}</h3>
      <label class="opt"><input type="radio" name="scope" value="topic" checked> ${T.scopeTopic} <span class="muted">(${n(state.lang, state.topic)})</span></label>
      <label class="opt"><input type="radio" name="scope" value="lang"> ${T.scopeLang} <span class="muted">(${n(state.lang)})</span></label>
      <label class="opt"><input type="radio" name="scope" value="all"> ${T.scopeAll} <span class="muted">(${n()})</span></label>
      <label class="opt"><input type="checkbox" name="progress"> ${T.withProgress}</label>
      <button type="button" class="btn primary" data-action="do-export">${T.exportBtn}</button>
    </section>
    <section>
      <h3>${T.importTitle}</h3>
      <label class="btn file-btn"><input type="file" id="import-file" accept=".json,application/json"> ${T.chooseFile}</label>
      <div id="import-result" class="import-result"></div>
    </section>
  </form>`;
  dlg.showModal();
}

function doExport() {
  const form = $('#dlg-data form');
  const scope = form.scope.value;
  const lang = scope === 'all' ? null : state.lang;
  const topic = scope === 'topic' ? state.topic : null;
  const data = store.buildExport({ lang, topic, includeProgress: form.progress.checked });
  const day = new Date().toISOString().slice(0, 10);
  const name = ['grammatik-kanpeki', lang || 'all', topic, day].filter(Boolean).join('-') + '.json';
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

let pendingImport = null;
async function onImportFile(file) {
  const T = t();
  const out = $('#import-result');
  const parsed = store.parseImport(await file.text(), file.name);
  if (parsed.error) { out.innerHTML = `<p class="error">${esc(parsed.error)}</p>`; return; }
  pendingImport = parsed;
  out.innerHTML = `<p>${esc(T.importSummary(parsed))}</p>
    ${parsed.invalid.length ? `<details><summary class="error">${parsed.invalid.length} ✕</summary><ul class="small">${parsed.invalid.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></details>` : ''}
    ${parsed.cards.length ? `<div class="actions">
      <button type="button" class="btn primary" data-action="import-overwrite">${T.importOverwrite}</button>
      <button type="button" class="btn" data-action="import-new">${T.importNew}</button></div>` : ''}`;
}

function doImport(overwrite) {
  if (!pendingImport) return;
  const r = store.applyImport(pendingImport, { overwrite });
  pendingImport = null;
  $('#import-result').innerHTML = `<p class="ok">${esc(t().importDone(r))}</p>`;
  render();
}

function openSettings() {
  const T = t();
  const S = settings();
  const L = LANGS[state.lang];
  const dlg = $('#dlg-settings');
  const THEME_ICON = {
    light: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/></g></svg>',
    dark: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z"/></svg>',
    system: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/></g></svg>',
  };
  const explainOpts = L.explainLangs.map(([v]) => [v, LANG_NAMES[v] || v]);
  dlg.innerHTML = `<form method="dialog" class="dlg">
    <header><h2>${T.settings}</h2><button class="icon-btn" value="close" aria-label="${T.close}">✕</button></header>
    <section>
      <h3>${T.appearance}</h3>
      <div class="theme-pick" role="radiogroup" aria-label="${esc(T.appearance)}">
        ${['light', 'dark', 'system'].map((v) => `<label class="theme-opt">
          <input type="radio" name="theme" value="${v}" ${S.theme === v ? 'checked' : ''}>
          <span>${THEME_ICON[v]}${esc(T.theme[v])}</span></label>`).join('')}
      </div>
    </section>
    <section>
      <h3>${T.studySettings}</h3>
      <label class="opt row">${T.newPerDay}<input type="number" min="0" max="9999" name="newPerDay" value="${S.newPerDay}"></label>
      <label class="opt row">${T.reviewsPerDay}<input type="number" min="0" max="9999" name="reviewsPerDay" value="${S.reviewsPerDay}"></label>
    </section>
    <section>
      <h3>${T.courseSettings}</h3>
      ${explainOpts.length > 1 ? `<label class="opt row">${T.explainLang}
        <select name="explainLang">${explainOpts.map(([v, l]) => `<option value="${v}" ${S.explainLang[state.lang] === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>` : ''}
      ${state.lang === 'ja' ? `<label class="opt"><input type="checkbox" name="furigana" ${S.furigana ? 'checked' : ''}> ${T.furigana}</label>` : ''}
      <label class="opt"><input type="checkbox" name="showForm" ${S.showForm ? 'checked' : ''}> ${T.showForm}</label>
    </section>
    ${L.speech ? speechSettingsHTML() : ''}
    <section><button type="button" class="btn danger" data-action="reset-progress">${T.resetProgress}</button></section>
  </form>`;
  if (!dlg.open) dlg.showModal();
}

function speechSettingsHTML() {
  const T = t();
  const lang = state.lang;
  const voices = speech.voicesFor(speechLocale(lang));
  const head = `<section><h3>${T.speechTitle}</h3>`;
  if (!speech.supported()) return `${head}<p class="hint">${esc(T.noSpeech)}</p></section>`;
  if (!voices.length) return `${head}<p class="hint">${esc(T.noVoice)}</p></section>`;
  const o = speechOpts(lang);
  const chosen = voices.some((v) => v.voiceURI === o.voiceURI) ? o.voiceURI : '';
  const rates = Object.keys(T.rates).map(Number).sort((a, b) => a - b);
  // "Microsoft Nanami Online (Natural) - Japanese (Japan)" → "Microsoft Nanami Online (Natural)": the list is one
  // language anyway. When it mixes regions (German from Germany, Austria, Switzerland), the locale tells them apart.
  const regions = new Set(voices.map((v) => v.lang.replace('_', '-'))).size > 1;
  const name = (v) => v.name.replace(/\s+-\s+[^-]+$/, '') + (regions ? ` · ${v.lang.replace('_', '-')}` : '');
  return `${head}
    <label class="opt row">${T.voice}
      <select name="speechVoice">
        <option value="" ${chosen ? '' : 'selected'}>${esc(T.voiceAuto)} (${esc(name(voices[0]))})</option>
        ${voices.map((v) => `<option value="${esc(v.voiceURI)}" ${v.voiceURI === chosen ? 'selected' : ''}>${esc(name(v))}</option>`).join('')}
      </select></label>
    <label class="opt row">${T.rate}
      <select name="speechRate">${rates.map((r) => `<option value="${r}" ${r === o.rate ? 'selected' : ''}>${esc(T.rates[r])} (${r}×)</option>`).join('')}</select></label>
    <div class="speech-test"><button type="button" class="btn small" data-speak="${esc(T.speechSample)}" data-speak-lang="${lang}">${esc(T.testVoice)}</button></div>
  </section>`;
}

// ---------- add / edit card (like Anki's "Add" window) ----------

const LANG_NAMES = { de: 'Deutsch', en: 'English', 'zh-Hant': '繁體中文' };

// The open form: { id (card being edited, or null), lang, values, errors, status: { kind, text } }.
let cardForm = null;

function openCardForm(id = null) {
  const card = id ? store.getCard(id) : null;
  if (id && !card) return;
  const lang = card?.language || state.lang;
  cardForm = { id, lang, values: card ? valuesFromCard(card) : emptyValues(lang, state.topic), errors: {}, status: null };
  renderCardForm();
  const dlg = $('#dlg-card');
  if (!dlg.open) dlg.showModal();
  focusCardField();
}

function focusCardField(name) {
  const f = $('#card-form');
  const el = name ? f.querySelector(`[name="${name}"]`) : f.querySelector('[data-main]');
  el?.focus();
}

/** Only worth showing once the text has furigana markup. */
const rubyPreview = (v) => (String(v).includes('{') ? String(v).split('\n').map(rubyHTML).join('　／　') : '');

/** One labelled input. */
function field(name, label, value, o = {}) {
  const T = t().form;
  const err = cardForm.errors[name];
  const attrs = `name="${name}" ${o.lang ? `lang="${o.lang}"` : ''} ${o.ph ? `placeholder="${esc(o.ph)}"` : ''} ${o.main ? 'data-main' : ''} ${o.ruby ? 'data-ruby' : ''} ${err ? 'aria-invalid="true"' : ''} autocomplete="off" spellcheck="false"`;
  const control = o.rows
    ? `<textarea ${attrs} rows="${o.rows}">${esc(value)}</textarea>`
    : `<input ${attrs} value="${esc(value)}">`;
  return `<label class="field"><span class="field-label">${esc(label)}</span>${control}
    ${o.ruby ? `<span class="ruby-preview" lang="ja">${rubyPreview(value)}</span>` : ''}
    ${o.help ? `<span class="field-help">${esc(o.help)}</span>` : ''}
    ${err ? `<span class="field-error">${esc(T[err])}</span>` : ''}</label>`;
}

/** A localized value: the first language is shown, the others sit behind "other languages". */
function locFields(prefix, label, langs, values, o = {}) {
  const [first, ...rest] = langs;
  const one = (k) => field(`${prefix}.${k}`, `${label} · ${LANG_NAMES[k] || k}`, values[k] || '', { ...o, lang: k });
  return `${one(first)}
    ${rest.length ? `<details class="more-langs" ${rest.some((k) => values[k]) ? 'open' : ''}>
      <summary>${esc(t().form.otherLangs)}</summary>${rest.map(one).join('')}</details>` : ''}`;
}

/** Answers with a note (correct but not ideal / typical mistakes). */
function answerRows(list, label) {
  const T = t().form;
  const rows = cardForm.values[list];
  const lang = cardForm.lang;
  const noteLang = LANGS[lang].noteLang;
  return `<details class="form-more" ${rows.length ? 'open' : ''}>
    <summary>${esc(label)} <span class="muted">(${rows.filter((r) => r.text).length})</span></summary>
    <div class="rows" data-list="${list}">
      ${rows.map((r, i) => `<div class="ans-row">
        <input name="row-text" lang="${lang}" value="${esc(r.text)}" placeholder="${esc(T.rowText)}" aria-label="${esc(T.rowText)}" autocomplete="off" spellcheck="false">
        <input name="row-note" lang="${noteLang}" value="${esc(r.note)}" placeholder="${esc(T.rowNote)}" aria-label="${esc(T.rowNote)}" autocomplete="off">
        <button type="button" class="icon-btn" data-action="remove-row" data-list="${list}" data-index="${i}" title="${esc(T.removeRow)}" aria-label="${esc(T.removeRow)}">✕</button>
      </div>`).join('')}
      <button type="button" class="link" data-action="add-row" data-list="${list}">＋ ${esc(T.addRow)}</button>
    </div></details>`;
}

function renderCardForm() {
  const T = t().form;
  const { lang, values: v } = cardForm;
  const L = LANGS[lang];
  const type = topicType(lang, v.topic);
  const labels = { ...UI[lang].labels, ...labelsOf(lang, v.topic) };
  const ja = lang === 'ja';
  const langs = formLangs(lang);
  const indent = (id) => '   '.repeat(ancestry(lang, id).length - 1);
  const topics = L.topics.map((tp) => `<option value="${tp.id}" ${tp.id === v.topic ? 'selected' : ''}>${indent(tp.id)}${esc(tp.label.replace(/­/g, ''))}</option>`).join('');

  let front;
  if (type === 'rewrite') {
    front = field('source', labels.source, v.source, { rows: 3, lang, main: true })
      + field('task', T.task, v.task, { ph: T.taskPh, lang: L.noteLang });
  } else if (type === 'cloze') {
    front = field('sentence', T.sentence, v.sentence, { rows: 2, lang, main: true, ruby: ja, help: T.sentenceHelp })
      + `<div class="field-grid">
          ${field('baseWord', T.baseWord, v.baseWord, { lang, ruby: ja })}
          ${field('baseMeaning', T.baseMeaning, v.baseMeaning, { lang: L.noteLang })}
          ${field('basePos', T.pos, v.basePos, { lang: L.noteLang })}
        </div>`
      + field('task', T.task, v.task, { ph: T.taskPh, lang: L.noteLang });
  } else {
    front = `<div class="field-grid">
        ${field('word', T.word, v.word, { lang, main: true, ruby: ja })}
        ${field('pos', T.pos, v.pos, { lang: L.noteLang })}
      </div>`
      + field('example', T.example, v.example, { rows: 2, lang, ruby: ja });
  }

  const facetDefs = facetsOf(lang, v.topic);
  const facets = Object.entries(facetDefs).map(([key, names]) => `<label class="field"><span class="field-label">${esc(UI[lang].facetLabels[key] || key)}</span>
      <select name="meta.${key}"><option value="">${T.facetNone}</option>${Object.entries(names).map(([val, name]) => `<option value="${esc(val)}" ${v.meta[key] === val ? 'selected' : ''}>${esc(name)}</option>`).join('')}</select></label>`).join('');
  const hasMore = v.level || v.tags || v.cardSource || Object.keys(facetDefs).some((k) => v.meta[k]);
  const st = cardForm.status;

  $('#dlg-card').innerHTML = `<form id="card-form" class="dlg card-form" novalidate>
    <header><h2>${esc(cardForm.id ? T.editTitle : T.newTitle)}</h2>
      <button type="button" class="icon-btn" data-action="close-card-form" aria-label="${esc(t().close)}">✕</button></header>
    <div class="dlg-body">
      <section>
        <label class="field"><span class="field-label">${esc(T.topic)}</span><select name="topic">${topics}</select></label>
      </section>
      <section>
        <h3>${esc(T.front)}</h3>
        ${front}
      </section>
      <section>
        <h3>${esc(T.answer)}</h3>
        ${field('accepted', type === 'flip' ? T.meanings : type === 'rewrite' ? labels.target : T.accepted, v.accepted, {
          rows: type === 'rewrite' ? 3 : 2, lang: type === 'flip' ? L.noteLang : lang, ruby: ja && type !== 'flip',
          help: type === 'flip' ? T.meaningsHelp : T.acceptedHelp,
        })}
        ${answerRows('acceptable', T.acceptable)}
        ${type === 'flip' ? '' : answerRows('mistakes', T.mistakes)}
      </section>
      <section>
        <h3>${esc(T.helps)}</h3>
        ${locFields('tr', type === 'flip' ? T.exampleTranslation : T.translation, langs.translation, v.translation)}
        ${type === 'flip' ? '' : field('hint', T.hint, v.hint, { lang: L.noteLang })}
        <details class="form-more" ${Object.values(v.explanation).some(Boolean) ? 'open' : ''}>
          <summary>${esc(T.explanation)}</summary>
          ${locFields('ex', t().explanation, langs.explanation, v.explanation, { rows: 3 })}
        </details>
        <details class="form-more" ${hasMore ? 'open' : ''}>
          <summary>${esc(T.more)}</summary>
          <div class="field-grid">
            ${facets}
            ${field('level', T.level, v.level, { ph: ja ? 'N5' : 'C1' })}
            ${field('tags', T.tags, v.tags, { ph: T.tagsPh })}
          </div>
          ${field('cardSource', T.source, v.cardSource, { ph: T.sourcePh })}
        </details>
      </section>
    </div>
    <footer>
      <div id="form-warn" class="form-warn" aria-live="polite">${warningsHTML(v)}</div>
      ${st ? `<p class="form-status ${st.kind}" role="status">${esc(st.text)}</p>` : ''}
      <div class="form-buttons">
        <span class="hint">${esc(T.keyHint)}</span>
        <button type="button" class="btn" data-action="close-card-form">${esc(T.cancel)}</button>
        <button type="submit" class="btn primary">${esc(cardForm.id ? T.saveBtn : T.addBtn)}</button>
      </div>
    </footer>
  </form>`;
}

/** The form's current values (rows and localized fields included). */
function gatherValues() {
  const f = $('#card-form');
  const prev = cardForm.values;
  const v = { ...prev, translation: { ...prev.translation }, explanation: { ...prev.explanation }, meta: { ...prev.meta } };
  const maps = { tr: 'translation', ex: 'explanation', meta: 'meta' };
  for (const el of f.elements) {
    if (!el.name || el.name.startsWith('row-')) continue;
    const [k, sub] = el.name.split('.');
    if (sub) v[maps[k]][sub] = el.value;
    else v[k] = el.value;
  }
  for (const box of f.querySelectorAll('.rows[data-list]')) {
    v[box.dataset.list] = [...box.querySelectorAll('.ans-row')].map((r) => ({
      text: r.querySelector('[name="row-text"]').value, note: r.querySelector('[name="row-note"]').value,
    }));
  }
  return v;
}

/** The text a card is recognized by: its sentence, or its word. */
const mainText = (c) => toSurface(c.prompt?.source || c.prompt?.sentence || c.prompt?.word || '').trim();

/** Hints that do not block saving: a card with the same text exists, kanji without furigana. */
function warningsHTML(v) {
  const T = t().form;
  const lang = cardForm.lang;
  const type = topicType(lang, v.topic);
  const own = toSurface(type === 'rewrite' ? v.source : type === 'cloze' ? v.sentence : v.word).trim();
  const out = [];
  if (own && store.allCards().some((c) => c.language === lang && c.id !== cardForm.id && mainText(c) === own)) out.push(T.dup);
  const noFuri = missingFurigana(v, lang);
  if (noFuri.length) out.push(T.furigana(noFuri));
  return out.map((x) => `<p lang="${LANGS[lang].noteLang}">${esc(x)}</p>`).join('');
}

function saveCardForm() {
  const T = t().form;
  const v = gatherValues();
  const lang = cardForm.lang;
  cardForm.values = v;
  cardForm.errors = formErrors(v, lang);
  const firstError = Object.keys(cardForm.errors)[0];
  if (firstError) {
    cardForm.status = { kind: 'error', text: T.fixErrors };
    renderCardForm();
    return focusCardField(firstError);
  }
  const existing = cardForm.id ? store.getCard(cardForm.id) : null;
  const card = cardFromValues(v, { lang, existing, newId: (l, tp) => makeId(l, tp, (id) => !!store.getCard(id)) });
  const problems = store.validateCard(card);
  if (problems.length) {
    cardForm.status = { kind: 'error', text: problems.join(' · ') };
    return renderCardForm();
  }
  store.saveCard(card);
  // A card being answered right now is judged again with its new answers.
  const s = session();
  if (s?.current === card.id && s.phase === 'revealed' && s.result?.verdict !== 'flip') s.result = checkAnswer(card, s.input);
  if (existing) {
    $('#dlg-card').close();
    cardForm = null;
    render();
    return;
  }
  // As in Anki, the window stays open for the next card; topic, tags, level, source and facets are kept.
  const keep = { topic: v.topic, level: v.level, tags: v.tags, cardSource: v.cardSource, meta: v.meta };
  cardForm = { id: null, lang, values: { ...emptyValues(lang, v.topic), ...keep }, errors: {}, status: { kind: 'ok', text: T.added } };
  render();
  renderCardForm();
  focusCardField();
}

/** Re-draw the form with what was typed (topic changed, a row added or removed). */
function redrawCardForm(change) {
  cardForm.values = gatherValues();
  change?.(cardForm.values);
  cardForm.status = null;
  renderCardForm();
}

// ---------- events ----------

document.addEventListener('click', (e) => {
  const speakBtn = e.target.closest('[data-speak]');
  if (speakBtn) return playSpeakButton(speakBtn);
  const word = e.target.closest('.word[data-word]');
  if (word) return showPop(word); // tap on touch screens
  if (popWord && !e.target.closest('#word-pop')) hidePop();
  if (langMenuOpen() && !e.target.closest('.lang-menu')) setLangMenu(false);
  const el = e.target.closest('[data-action],[data-grade],[data-explain],[data-topic],[data-toggle-topic],[data-view],[data-lang-switch]');
  if (!el) return;
  const a = el.dataset.action;
  if (a === 'vocab-add' || a === 'vocab-remove') return toggleSavedWord(a === 'vocab-add');
  if (a === 'add-card') { setMenu(false); return openCardForm(); }
  if (a === 'edit-card') return openCardForm(el.dataset.id);
  if (a === 'close-card-form') { $('#dlg-card').close(); return; }
  if (a === 'add-row') {
    redrawCardForm((v) => v[el.dataset.list].push({ text: '', note: '' }));
    return [...document.querySelectorAll(`.rows[data-list="${el.dataset.list}"] [name="row-text"]`)].at(-1)?.focus();
  }
  if (a === 'remove-row') return redrawCardForm((v) => v[el.dataset.list].splice(Number(el.dataset.index), 1));
  if (a === 'toggle-lang') return setLangMenu(!langMenuOpen());
  if (el.dataset.langSwitch) {
    const lang = el.dataset.langSwitch;
    setLangMenu(false);
    $('#lang-btn').focus();
    if (lang !== state.lang) go(lang, LANGS[lang].topics[0].id, 'learn');
    return;
  }
  if (el.dataset.toggleTopic) {
    const k = `${state.lang}/${el.dataset.toggleTopic}`;
    const collapsed = settings().collapsed.filter((x) => x !== k);
    if (el.getAttribute('aria-expanded') === 'true') collapsed.push(k);
    store.setSettings({ collapsed });
    renderSidebar();
    $(`[data-toggle-topic="${el.dataset.toggleTopic}"]`)?.focus();
    return;
  }
  if (el.dataset.topic) { setMenu(false); return go(state.lang, el.dataset.topic, state.view); }
  if (a === 'toggle-menu') {
    setMenu(!state.menuOpen);
    if (state.menuOpen) $('.side-item[aria-current]')?.focus();
    return;
  }
  if (a === 'close-menu') return setMenu(false);
  if (el.dataset.view) return go(state.lang, state.topic, el.dataset.view);
  if (el.dataset.grade) return grade(el.dataset.grade);
  if (el.dataset.explain) { store.setSettings({ explainLang: { ...settings().explainLang, [state.lang]: el.dataset.explain } }); return render(); }
  switch (a) {
    case 'start': return startSession('review');
    case 'cram': return startSession('cram');
    case 'end': speech.stop(); delete state.sessions[key()]; return render();
    case 'reveal': return submitAnswer(true);
    case 'show-form': {
      const s = session();
      s.input = $('#answer')?.value ?? s.input;
      s.aids.add('form');
      return render();
    }
    case 'save-accepted': return saveAlternative('accepted');
    case 'save-acceptable': return saveAlternative('acceptable');
    case 'delete':
      if (confirm(t().confirmDel)) { store.deleteCard(el.dataset.id); render(); }
      return;
    case 'restore': store.restoreHidden(state.lang, state.topic); return render();
    case 'open-data': return openDataDialog();
    case 'open-settings': return openSettings();
    case 'do-export': return doExport();
    case 'import-overwrite': return doImport(true);
    case 'import-new': return doImport(false);
    case 'reset-progress':
      if (confirm(t().confirmReset)) {
        store.resetProgress(store.cardsFor(state.lang, state.topic).map((c) => c.id));
        delete state.sessions[key()];
        $('#dlg-settings').close();
        render();
      }
      return;
  }
});

document.addEventListener('submit', (e) => {
  if (e.target.id === 'answer-form') { e.preventDefault(); submitAnswer(); }
  if (e.target.id === 'card-form') { e.preventDefault(); saveCardForm(); }
});

document.addEventListener('input', (e) => {
  if (e.target.id === 'answer') { const s = session(); if (s) s.input = e.target.value; updateKanaPreview(); }
  if (e.target.id === 'card-search') { state.search = e.target.value; renderCardList(); }
  if (e.target.closest?.('#card-form')) {
    if (e.target.dataset.ruby !== undefined) e.target.parentElement.querySelector('.ruby-preview').innerHTML = rubyPreview(e.target.value);
    if (e.target.getAttribute('aria-invalid')) {
      e.target.removeAttribute('aria-invalid');
      e.target.parentElement.querySelector('.field-error')?.remove();
      delete cardForm.errors[e.target.name];
    }
    $('#form-warn').innerHTML = warningsHTML(gatherValues());
  }
});

document.addEventListener('change', (e) => {
  const el = e.target;
  if (el.id === 'import-file' && el.files[0]) return onImportFile(el.files[0]);
  if (el.name === 'topic' && el.closest('#card-form')) {
    redrawCardForm();
    return $('#card-form [name="topic"]').focus();
  }
  if (el.closest('#dlg-settings')) {
    if (el.name === 'newPerDay' || el.name === 'reviewsPerDay') store.setSettings({ [el.name]: Math.max(0, parseInt(el.value, 10) || 0) });
    if (el.name === 'explainLang') store.setSettings({ explainLang: { ...settings().explainLang, [state.lang]: el.value } });
    if (el.name === 'theme') { store.setSettings({ theme: el.value }); applyTheme(); }
    if (el.name === 'furigana' || el.name === 'showForm') store.setSettings({ [el.name]: el.checked });
    if (el.name === 'speechVoice' || el.name === 'speechRate') {
      const own = { ...settings().speech[state.lang] };
      if (el.name === 'speechVoice') own.voice = el.value;
      else own.rate = Number(el.value);
      store.setSettings({ speech: { ...settings().speech, [state.lang]: own } });
    }
    render();
  }
});

// Keep <details> hint state across re-renders.
document.addEventListener('toggle', (e) => {
  const d = e.target;
  if (!(d instanceof HTMLDetailsElement) || !d.dataset.aid) return;
  const s = session();
  if (!s) return;
  d.open ? s.aids.add(d.dataset.aid) : s.aids.delete(d.dataset.aid);
}, true);

document.addEventListener('keydown', (e) => {
  if (e.target.closest?.('#card-form')) {
    // Ctrl/Cmd+Enter saves, as in Anki. A plain Enter must not submit by accident (it also confirms IME input).
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); saveCardForm(); }
    else if (e.key === 'Enter' && e.target.tagName === 'INPUT') e.preventDefault();
    return;
  }
  if (e.target.closest?.('.lang-menu')) {
    const items = [...document.querySelectorAll('.lang-opt')];
    const i = items.indexOf(document.activeElement);
    if (e.target.id === 'lang-btn' && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { e.preventDefault(); setLangMenu(true, e.key === 'ArrowUp' ? 'last' : 'current'); return; }
    if (langMenuOpen()) {
      if (e.key === 'Escape') { e.preventDefault(); setLangMenu(false); $('#lang-btn').focus(); return; }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus(); return; }
      if (e.key === 'Home' || e.key === 'End') { e.preventDefault(); (e.key === 'Home' ? items[0] : items.at(-1)).focus(); return; }
      if (e.key === 'Tab') setLangMenu(false);
    }
    return;
  }
  if (state.menuOpen && e.key === 'Escape') { setMenu(false); $('#btn-menu').focus(); return; }
  if (popWord && e.key === 'Escape') { const w = popWord; hidePop(); w.focus(); return; }
  const word = e.target.closest?.('.word[data-word]');
  if (word && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); showPop(word); return; }
  if (word || e.target.closest?.('#word-pop')) return;
  const s = session();
  if (!s || state.view !== 'learn' || !s.current || document.querySelector('dialog[open]')) return;
  if (s.phase === 'answer' && rendererFor(currentCard()).flip) {
    if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) { e.preventDefault(); submitAnswer(true); }
    return;
  }
  if (s.phase === 'answer') {
    if (e.target.id === 'answer' && e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!e.isComposing && e.keyCode !== 229) submitAnswer();
    }
    return;
  }
  if (e.target.id === 'alt-note' || e.repeat) return;
  if (e.key === 'r' || e.key === 'R') {
    const btn = $('.card [data-speak-main]') || $('.card [data-speak]');
    if (btn && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); playSpeakButton(btn); }
    return;
  }
  const idx = ['1', '2', '3', '4'].indexOf(e.key);
  if (idx >= 0) { e.preventDefault(); grade(GRADES[idx]); }
  else if (e.key === 'Enter') { e.preventDefault(); grade($('.grade:focus')?.dataset.grade || SUGGEST[s.result.verdict]); }
});

// ---------- boot ----------

(async function boot() {
  if (!location.hash) {
    let last = null;
    try { last = localStorage.getItem('gk.route'); } catch {}
    history.replaceState(null, '', last || '#/de/nominalisierung/learn');
  }
  parseHash();
  applyTheme();
  try { await store.loadBundled(); } catch (err) { console.error(err); state.loadError = true; }
  render();
})();
