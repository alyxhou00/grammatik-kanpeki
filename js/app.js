import * as store from './store.js';
import { schedule, preview, isDue } from './srs.js';
import { checkAnswer } from './check.js';
import { UI } from './i18n.js';
import { LANGS, RENDERERS } from './topics.js';
import { esc, loc, isRomaji, romajiToHiragana } from './text.js';

const $ = (sel, el = document) => el.querySelector(sel);
const GRADES = ['again', 'hard', 'good', 'easy'];
const SUGGEST = { correct: 'good', acceptable: 'hard', close: 'hard', mistake: 'again', wrong: 'again', empty: 'again' };

const ICON = {
  trash: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" d="M4 7h16M10 11v6M14 11v6M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/></svg>',
};

const state = { lang: 'de', topic: 'nominalisierung', view: 'learn', sessions: {}, loadError: false, flash: '' };

const t = () => UI[state.lang];
const settings = () => store.getSettings();
const key = () => `${state.lang}/${state.topic}`;
const session = () => state.sessions[key()] || null;
const renderer = () => RENDERERS[state.topic];

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

// ---------- counts ----------

function counts(lang, topic) {
  const cards = store.cardsFor(lang, topic);
  let due = 0;
  let fresh = 0;
  for (const c of cards) {
    const p = store.getProgress(c.id);
    if (!p) fresh++;
    else if (isDue(p)) due++;
  }
  const newLeft = Math.max(0, settings().newPerDay - store.newIntroducedToday(lang, topic));
  return { total: cards.length, due, fresh, newToday: Math.min(fresh, newLeft) };
}

// ---------- render ----------

function render() {
  const L = LANGS[state.lang];
  document.documentElement.lang = L.htmlLang;
  document.body.dataset.lang = state.lang;
  document.body.classList.toggle('no-furigana', !settings().furigana);
  document.title = `${L.topics.find((x) => x.id === state.topic)?.label} · Grammatik Kanpeki`;

  for (const b of document.querySelectorAll('[data-lang-switch]')) b.setAttribute('aria-selected', b.dataset.langSwitch === state.lang);
  $('#btn-data').textContent = t().importExport;
  $('#btn-settings').title = t().settings;
  $('#btn-settings').setAttribute('aria-label', t().settings);

  $('#topic-tabs').innerHTML = `
    <div class="tabs" role="tablist">
      ${L.topics.map((tp) => `<button role="tab" class="tab" data-topic="${tp.id}" aria-selected="${tp.id === state.topic}">${esc(tp.label)}<span class="badge">${counts(state.lang, tp.id).total}</span></button>`).join('')}
    </div>
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
}

function renderOverview() {
  const c = counts(state.lang, state.topic);
  const T = t();
  const any = c.due + c.newToday > 0;
  return `<section class="panel overview">
    <h2>${T.todayTitle}</h2>
    <div class="stats">
      <div class="stat due"><span class="num">${c.due}</span><span class="lbl">${T.due}</span></div>
      <div class="stat new"><span class="num">${c.newToday}</span><span class="lbl">${T.new}</span></div>
      <div class="stat total"><span class="num">${c.total}</span><span class="lbl">${T.total}</span></div>
    </div>
    <div class="actions">
      <button class="btn primary big" data-action="start" ${any ? '' : 'disabled'}>${T.start}</button>
      <button class="btn" data-action="cram" ${c.total ? '' : 'disabled'}>${T.cram}</button>
    </div>
    <p class="hint">${any ? `${T.cram}: ${T.cramHint}` : T.nothingToday}</p>
  </section>`;
}

function ctx(extra = {}) {
  const s = session();
  return { t: t(), settings: settings(), aids: s?.aids || new Set(), revealed: s?.phase === 'revealed', ...extra };
}

function renderSession() {
  const s = session();
  const T = t();
  while (s.queue.length && !store.getCard(s.queue[0])) s.queue.shift();
  if (!s.queue.length) {
    return `<section class="panel done">
      <h2>${T.doneTitle}</h2><p>${T.doneText(s.reviewed)}</p>
      <button class="btn primary" data-action="end">${T.back}</button></section>`;
  }
  const card = store.getCard(s.queue[0]);
  const R = renderer();
  const c = ctx();
  const body = s.phase === 'answer'
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
      <span class="muted">${s.queue.length} ${T.remaining}</span>
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
  const ivs = s.mode === 'review' ? preview(store.getProgress(card.id)) : null;
  const iv = (g) => (!ivs ? '' : ivs[g] === 0 ? T.now : T.days(ivs[g]));
  const canSave = ['close', 'wrong'].includes(r.verdict) && s.input.trim();
  return `
    <div class="verdict v-${r.verdict}" role="status">
      <strong>${T.verdict[r.verdict]}</strong>${note ? `<p lang="${R.noteLang}">${esc(note)}</p>` : ''}
    </div>
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
  if (!s || !s.queue.length) return;
  if (s.phase === 'answer') {
    const input = $('#answer');
    if (input) { input.value = s.input; input.focus(); updateKanaPreview(); }
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
        const st = !p ? 'new' : isDue(p) ? 'due' : 'later';
        const label = st === 'new' ? T.status.new : st === 'due' ? T.status.due : T.status.on(fmt.format(new Date(p.due)));
        return `<li class="card-row">
          <div class="sum">${R.summary(c, ctx())}</div>
          <div class="row-meta">
            <span class="status s-${st}">${esc(label)}</span>
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
    const { newToday } = counts(state.lang, state.topic);
    const due = cards.filter((c) => isDue(store.getProgress(c.id)))
      .sort((a, b) => store.getProgress(a.id).due - store.getProgress(b.id).due);
    const fresh = cards.filter((c) => !store.getProgress(c.id)).slice(0, newToday);
    queue = [...due, ...fresh].map((c) => c.id);
  } else {
    queue = cards.map((c) => c.id).sort(() => Math.random() - 0.5);
  }
  state.sessions[key()] = { mode, queue, phase: 'answer', input: '', result: null, reviewed: 0, aids: new Set() };
  render();
}

function submitAnswer(reveal = false) {
  const s = session();
  const card = store.getCard(s.queue[0]);
  s.input = $('#answer')?.value ?? '';
  s.result = checkAnswer(card, reveal ? '' : s.input);
  s.phase = 'revealed';
  state.flash = '';
  render();
}

function grade(g) {
  const s = session();
  const id = s.queue[0];
  if (s.mode === 'review') {
    const prev = store.getProgress(id);
    if (!prev) store.countNewIntroduced(state.lang, state.topic);
    store.setProgress(id, schedule(prev, g));
  }
  s.queue.shift();
  if (g === 'again') s.queue.splice(Math.min(3, s.queue.length), 0, id);
  else s.reviewed++;
  Object.assign(s, { phase: 'answer', input: '', result: null, aids: new Set() });
  state.flash = '';
  render();
}

function saveAlternative(kind) {
  const s = session();
  const id = s.queue[0];
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
      <label class="opt row">${T.newPerDay}<input type="number" min="0" max="500" name="newPerDay" value="${S.newPerDay}"></label>
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
  const el = e.target.closest('[data-action],[data-grade],[data-explain],[data-topic],[data-view],[data-lang-switch]');
  if (!el) return;
  const a = el.dataset.action;
  if (el.dataset.langSwitch) {
    const lang = el.dataset.langSwitch;
    return go(lang, LANGS[lang].topics[0].id, 'learn');
  }
  if (el.dataset.topic) return go(state.lang, el.dataset.topic, state.view);
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
    if (el.name === 'newPerDay') store.setSettings({ newPerDay: Math.max(0, parseInt(el.value, 10) || 0) });
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
  const s = session();
  if (!s || state.view !== 'learn' || !s.queue.length || document.querySelector('dialog[open]')) return;
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
