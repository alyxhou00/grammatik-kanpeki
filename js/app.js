import * as store from './store.js';
import { answer, preview, DEFAULTS, dayStartMs, isNew, isLearning, isReviewDue, learningDueToday } from './srs.js';
import { checkAnswer } from './check.js';
import { UI } from './i18n.js';
import { LANGS, RENDERERS, vocabId, vocabCardFrom } from './topics.js';
import { esc, loc, isRomaji, romajiToHiragana, rubyHTML, toKana, toSurface } from './text.js';

const $ = (sel, el = document) => el.querySelector(sel);
const GRADES = ['again', 'hard', 'good', 'easy'];
const SUGGEST = { correct: 'good', acceptable: 'hard', close: 'hard', mistake: 'again', wrong: 'again', empty: 'again', flip: 'good' };

const ICON = {
  trash: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" d="M4 7h16M10 11v6M14 11v6M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/></svg>',
};

const state = { lang: 'de', topic: 'nominalisierung', view: 'learn', sessions: {}, loadError: false, flash: '', menuOpen: false };

const t = () => UI[state.lang];
const settings = () => store.getSettings();
const key = () => `${state.lang}/${state.topic}`;
const session = () => state.sessions[key()] || null;
const renderer = () => RENDERERS[state.topic];
const cfg = () => ({ ...DEFAULTS, newPerDay: settings().newPerDay, reviewsPerDay: settings().reviewsPerDay });
let waitTimer = null;

// ---------- routing ----------

function parseHash() {
  const [, lang, topic, view] = location.hash.split('/');
  if (LANGS[lang]) {
    state.lang = lang;
    const topics = LANGS[lang].topics.map((x) => x.id);
    state.topic = topics.includes(topic) ? topic : topics[0];
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
    el.classList.toggle('saved', !!store.getCard(vocabId(w.lemma)));
  }
}

function renderPop(w) {
  const T = UI.ja;
  const saved = !!store.getCard(vocabId(w.lemma));
  const reading = toKana(w.lemma);
  pop().innerHTML = `
    <div class="pop-word" lang="ja">${rubyHTML(w.lemma)}</div>
    ${reading !== toSurface(w.lemma) ? `<div class="pop-reading" lang="ja">${esc(reading)}</div>` : ''}
    <div class="pop-meaning">${esc(w.meaning)}</div>
    ${w.pos ? `<span class="group-chip">${esc(w.pos)}</span>` : ''}
    <div class="pop-actions">
      ${saved
        ? `<span class="pop-saved">✓ ${T.inWordList}</span><button type="button" class="link" data-action="vocab-remove">${T.remove}</button>`
        : `<button type="button" class="btn primary small" data-action="vocab-add">＋ ${T.addToWordList}</button>`}
    </div>`;
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
    store.saveCard(vocabCardFrom(w, source));
  } else {
    store.deleteCard(vocabId(w.lemma));
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
  const reviewLeft = Math.max(0, S.reviewsPerDay - store.dailyCount(lang, topic, 'review'));
  const reviewToday = Math.min(review, reviewLeft);
  const newLeft = Math.max(0, S.newPerDay - store.dailyCount(lang, topic, 'new'));
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

function renderSidebar() {
  const L = LANGS[state.lang];
  const groups = [...new Set(L.topics.map((tp) => tp.group))];
  $('#sidebar').innerHTML = groups.map((g) => `
    <div class="side-group">
      <div class="side-title">${esc(t().groups[g])}</div>
      <nav class="side-nav" aria-label="${esc(t().groups[g])}">
        ${L.topics.filter((tp) => tp.group === g).map((tp) => `<button class="side-item" data-topic="${tp.id}" ${tp.id === state.topic ? 'aria-current="page"' : ''}>
          <span>${esc(tp.label)}</span><span class="badge">${counts(state.lang, tp.id).total}</span></button>`).join('')}
      </nav>
    </div>`).join('');
}

function render() {
  hidePop();
  const L = LANGS[state.lang];
  document.documentElement.lang = L.htmlLang;
  document.body.dataset.lang = state.lang;
  document.body.classList.toggle('no-furigana', !settings().furigana);
  const topicLabel = L.topics.find((x) => x.id === state.topic)?.label;
  document.title = `${topicLabel} · ${state.lang === 'ja' ? 'グラマティック完璧' : 'Grammatik Kanpeki'}`;
  const brand = $('#brand');
  brand.href = `#/${state.lang}/${L.topics[0].id}/learn`;
  brand.innerHTML = state.lang === 'ja'
    ? '<span lang="ja">グラマティック</span><span class="brand-2" lang="ja">完璧</span>'
    : '<span lang="de">Grammatik</span> <span class="brand-2" lang="de">Kanpeki</span>';
  setMenu(state.menuOpen);

  for (const b of document.querySelectorAll('[data-lang-switch]')) b.setAttribute('aria-selected', b.dataset.langSwitch === state.lang);
  $('#btn-data .btn-label').textContent = t().importExport;
  $('#btn-data').setAttribute('aria-label', t().importExport);
  $('#btn-data').title = t().importExport;
  $('#btn-settings').title = t().settings;
  $('#btn-settings').setAttribute('aria-label', t().settings);

  renderSidebar();
  $('#btn-menu').setAttribute('aria-label', t().menu);

  $('#content-head').innerHTML = `
    <h1>${esc(topicLabel)}</h1>
    <div class="seg" role="tablist">
      <button role="tab" data-view="learn" aria-selected="${state.view === 'learn'}">${t().learn}</button>
      <button role="tab" data-view="cards" aria-selected="${state.view === 'cards'}">${t().cards}</button>
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
    </div>
    <p class="hint">${!c.total && state.topic === 'vocab' ? T.vocabEmpty : any ? `${T.cram}: ${T.cramHint}` : T.nothingToday}</p>
  </section>`;
}

function ctx(extra = {}) {
  const s = session();
  return { t: t(), settings: settings(), aids: s?.aids || new Set(), revealed: s?.phase === 'revealed', ...extra };
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
  const R = renderer();
  const c = ctx();
  const body = s.phase === 'answer' && R.flip
    ? `<div class="form-actions flip-actions">
        <button type="button" class="btn primary big" data-action="reveal" id="reveal-btn">${T.showAnswer}</button>
      </div>`
    : s.phase === 'answer'
    ? `<form id="answer-form" class="answer-form" autocomplete="off">
        ${R.input(card, c)}
        <div class="form-actions">
          <span class="hint">${T.enterHint}</span>
          <button type="button" class="btn ghost" data-action="reveal">${T.skip}</button>
          <button type="submit" class="btn primary">${T.check}</button>
        </div>
      </form>`
    : renderReveal(card, c);
  return `<div class="session-bar">
      <span class="pill">${s.mode === 'cram' ? T.cram : T.learn}</span>
      <span class="muted">${remaining} ${T.remaining}</span>
      <button class="link" data-action="end">${T.end}</button>
    </div>
    <article class="panel card phase-${s.phase}">
      <div class="front">${R.front(card, c)}</div>
      ${body}
    </article>`;
}

function renderReveal(card, c) {
  const s = session();
  const T = t();
  const r = s.result;
  const R = renderer();
  const suggest = SUGGEST[r.verdict];
  const reason = r.verdict === 'close' ? T.closeReason[r.reason] : '';
  const note = r.note ? loc(r.note, [R.noteLang]) : reason;
  const ivs = s.mode === 'review' ? preview(store.getProgress(card.id), { cardId: card.id, cfg: cfg() }) : null;
  const iv = (g) => (!ivs ? '' : ivs[g].kind === 'min' ? T.mins(ivs[g].value) : T.days(ivs[g].value));
  const canSave = ['close', 'wrong'].includes(r.verdict) && s.input.trim();
  return `
    ${r.verdict === 'flip' ? '' : `<div class="verdict v-${r.verdict}" role="status">
      <strong>${T.verdict[r.verdict]}</strong>${note ? `<p lang="${R.noteLang}">${esc(note)}</p>` : ''}
    </div>`}
    <div class="back">${R.back(card, r, s.input, c)}</div>
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
    <p class="hint center">${T.gradeHint}</p>`;
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
  const R = renderer();
  $('#card-count').textContent = cards.length;
  $('#card-list').innerHTML = cards.length
    ? cards.map((c) => {
        const p = store.getProgress(c.id);
        const st = isNew(p) ? 'new' : isLearning(p) ? 'learn' : isReviewDue(p) ? 'due' : 'later';
        const label = st === 'later' ? T.status.on(fmt.format(new Date(dayStartMs(p.dueDay)))) : T.status[st];
        return `<li class="card-row">
          <div class="sum">${R.summary(c, ctx())}</div>
          <div class="row-meta">
            <span class="status s-${st}">${esc(label)}</span>
            ${p?.leech ? `<span class="status s-leech">${T.leech}</span>` : ''}
            <span class="src" title="${esc(c.id)}">${T.source}: ${esc(c.source)}</span>
            <button class="icon-btn" data-action="delete" data-id="${esc(c.id)}" title="${T.del}" aria-label="${T.del}">${ICON.trash}</button>
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
  s.result = renderer().flip ? { verdict: 'flip' } : checkAnswer(card, reveal ? '' : s.input);
  s.phase = 'revealed';
  state.flash = '';
  render();
}

function grade(g) {
  const s = session();
  const id = s.current;
  if (s.mode === 'review') {
    const prev = store.getProgress(id);
    if (isNew(prev)) store.bumpDaily(state.lang, state.topic, 'new');
    else if (prev.type === 'review') store.bumpDaily(state.lang, state.topic, 'review');
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
  const n = (lang, topic) => store.allCards().filter((c) => (!lang || c.language === lang) && (!topic || c.topic === topic)).length;
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
  const dlg = $('#dlg-settings');
  dlg.innerHTML = `<form method="dialog" class="dlg">
    <header><h2>${T.settings}</h2><button class="icon-btn" value="close" aria-label="${T.close}">✕</button></header>
    <section>
      <label class="opt row">${T.newPerDay}<input type="number" min="0" max="9999" name="newPerDay" value="${S.newPerDay}"></label>
      <label class="opt row">${T.reviewsPerDay}<input type="number" min="0" max="9999" name="reviewsPerDay" value="${S.reviewsPerDay}"></label>
      ${state.lang === 'de' ? `<label class="opt row">${T.explainLang}
        <select name="explainLang">${[['de', 'Deutsch'], ['en', 'English'], ['zh-Hant', '繁體中文']].map(([v, l]) => `<option value="${v}" ${S.explainLang === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>` : `
        <label class="opt"><input type="checkbox" name="furigana" ${S.furigana ? 'checked' : ''}> ${T.furigana}</label>
        <label class="opt"><input type="checkbox" name="showForm" ${S.showForm ? 'checked' : ''}> ${T.showForm}</label>`}
    </section>
    <section><button type="button" class="btn danger" data-action="reset-progress">${T.resetProgress}</button></section>
  </form>`;
  dlg.showModal();
}

// ---------- events ----------

document.addEventListener('click', (e) => {
  const word = e.target.closest('.word[data-word]');
  if (word) return showPop(word); // tap on touch screens
  if (popWord && !e.target.closest('#word-pop')) hidePop();
  const el = e.target.closest('[data-action],[data-grade],[data-explain],[data-topic],[data-view],[data-lang-switch]');
  if (!el) return;
  const a = el.dataset.action;
  if (a === 'vocab-add' || a === 'vocab-remove') return toggleSavedWord(a === 'vocab-add');
  if (el.dataset.langSwitch) {
    const lang = el.dataset.langSwitch;
    return go(lang, LANGS[lang].topics[0].id, 'learn');
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
  if (el.dataset.explain) { store.setSettings({ explainLang: el.dataset.explain }); return render(); }
  switch (a) {
    case 'start': return startSession('review');
    case 'cram': return startSession('cram');
    case 'end': delete state.sessions[key()]; return render();
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
});

document.addEventListener('input', (e) => {
  if (e.target.id === 'answer') { const s = session(); if (s) s.input = e.target.value; updateKanaPreview(); }
  if (e.target.id === 'card-search') { state.search = e.target.value; renderCardList(); }
});

document.addEventListener('change', (e) => {
  const el = e.target;
  if (el.id === 'import-file' && el.files[0]) return onImportFile(el.files[0]);
  if (el.closest('#dlg-settings')) {
    if (el.name === 'newPerDay' || el.name === 'reviewsPerDay') store.setSettings({ [el.name]: Math.max(0, parseInt(el.value, 10) || 0) });
    if (el.name === 'explainLang') store.setSettings({ explainLang: el.value });
    if (el.name === 'furigana' || el.name === 'showForm') store.setSettings({ [el.name]: el.checked });
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
  if (state.menuOpen && e.key === 'Escape') { setMenu(false); $('#btn-menu').focus(); return; }
  if (popWord && e.key === 'Escape') { const w = popWord; hidePop(); w.focus(); return; }
  const word = e.target.closest?.('.word[data-word]');
  if (word && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); showPop(word); return; }
  if (word || e.target.closest?.('#word-pop')) return;
  const s = session();
  if (!s || state.view !== 'learn' || !s.current || document.querySelector('dialog[open]')) return;
  if (s.phase === 'answer' && renderer().flip) {
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
  try { await store.loadBundled(); } catch (err) { console.error(err); state.loadError = true; }
  render();
})();
