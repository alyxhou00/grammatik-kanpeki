// Checks the study log (js/studylog.js) and how js/store.js keeps, exports and imports it.
// Run: node tests/studylog.test.mjs
import assert from 'node:assert/strict';
import { addAnswer, countOn, langsOn, streaks, heatmap, mergeLogs, onlyLang, dayKey, keyDay, weekday } from '../js/studylog.js';
import { dayIndex } from '../js/srs.js';

let passed = 0;
const test = async (name, fn) => { await fn(); passed++; console.log(`ok - ${name}`); };

const T = keyDay('2026-11-05'); // a Thursday
/** A log with `n` answers in German on each of the given day offsets from T. */
const logOn = (offsets, n = 1) => offsets.reduce((log, o) => {
  for (let i = 0; i < n; i++) log = addAnswer(log, { day: T + o, lang: 'de' });
  return log;
}, {});

await test('day keys round-trip and follow the 4 AM day start', () => {
  assert.equal(dayKey(T), '2026-11-05');
  assert.equal(weekday(T), 4);
  // Local times: 3:30 AM still belongs to the day before, 4:00 AM starts the new day.
  assert.equal(dayKey(dayIndex(new Date(2026, 10, 6, 3, 30).getTime())), '2026-11-05');
  assert.equal(dayKey(dayIndex(new Date(2026, 10, 6, 4, 0).getTime())), '2026-11-06');
  // The night summer time starts (Europe) has no 2-3 AM; the day still starts at 4 AM.
  assert.equal(dayKey(dayIndex(new Date(2026, 2, 29, 4, 0).getTime())), '2026-03-29');
});

await test('addAnswer counts answers, new cards and Again per language, without changing the old log', () => {
  const a = addAnswer({}, { day: T, lang: 'de', isNew: true });
  const b = addAnswer(a, { day: T, lang: 'de', again: true });
  const c = addAnswer(b, { day: T, lang: 'ja' });
  assert.deepEqual(a, { '2026-11-05': { de: { n: 1, new: 1, again: 0 } } });
  assert.deepEqual(c['2026-11-05'], { de: { n: 2, new: 1, again: 1 }, ja: { n: 1, new: 0, again: 0 } });
  assert.equal(countOn(c, T), 3);
  assert.equal(countOn(c, T, 'ja'), 1);
  assert.equal(countOn(c, T + 1), 0);
  assert.deepEqual(langsOn(c, T), [['de', 2], ['ja', 1]]);
});

await test('streak counts back from today', () => {
  assert.deepEqual(streaks(logOn([-2, -1, 0]), T), { current: 3, longest: 3, studiedToday: true, days: 3 });
});

await test('streak is kept until today is over (counted to yesterday)', () => {
  assert.deepEqual(streaks(logOn([-2, -1]), T), { current: 2, longest: 2, studiedToday: false, days: 2 });
});

await test('a whole day without studying breaks the streak; longest is kept', () => {
  const st = streaks(logOn([-10, -9, -8, -7, -2]), T);
  assert.equal(st.current, 0);
  assert.equal(st.longest, 4);
  assert.equal(st.days, 5);
  assert.deepEqual(streaks({}, T), { current: 0, longest: 0, studiedToday: false, days: 0 });
});

await test('streak per language, and days after today are ignored', () => {
  let log = logOn([-1, 0]);
  log = addAnswer(log, { day: T, lang: 'ja' });
  log = addAnswer(log, { day: T + 3, lang: 'de' }); // clock was wrong once
  assert.equal(streaks(log, T).current, 2);
  assert.equal(streaks(log, T, 'ja').current, 1);
  assert.equal(streaks(log, T).days, 2);
});

await test('heatmap: 53 weeks, starting on the given weekday, ending with today', () => {
  for (const weekStart of [0, 1]) {
    const hm = heatmap(logOn([0]), T, { weekStart });
    assert.equal(hm.weeks.length, 53);
    assert.ok(hm.weeks.every((col) => col.length === 7));
    assert.equal(weekday(hm.first), weekStart);
    const last = hm.weeks.at(-1);
    const row = (4 - weekStart + 7) % 7; // Thursday
    assert.equal(last[row].day, T);
    assert.ok(last.slice(row + 1).every((c) => c === null), 'days after today are empty');
    assert.equal(hm.weeks[0][0].day, hm.first);
  }
});

await test('heatmap levels are quarters of the busiest day', () => {
  const log = { ...logOn([-3], 8), ...logOn([-2], 1), ...logOn([-1], 4), ...logOn([0], 6) };
  const hm = heatmap(log, T, { weekStart: 1 });
  const cell = (o) => hm.weeks.flat().find((c) => c?.day === T + o);
  assert.equal(hm.max, 8);
  assert.equal(hm.total, 19);
  assert.equal(hm.days, 4);
  assert.deepEqual([-3, -2, -1, 0, -4].map((o) => cell(o).level), [4, 1, 2, 3, 0]);
});

await test('mergeLogs keeps the larger count, and merging twice changes nothing', () => {
  const a = { '2026-11-04': { de: { n: 5, new: 2, again: 1 } } };
  const b = { '2026-11-04': { de: { n: 3, new: 3, again: 0 }, ja: { n: 2, new: 0, again: 0 } }, '2026-11-05': { de: { n: 1, new: 0, again: 0 } } };
  const m = mergeLogs(a, b);
  assert.deepEqual(m.log, {
    '2026-11-04': { de: { n: 5, new: 3, again: 1 }, ja: { n: 2, new: 0, again: 0 } },
    '2026-11-05': { de: { n: 1, new: 0, again: 0 } },
  });
  assert.equal(m.days, 2);
  assert.deepEqual(mergeLogs(m.log, b).log, m.log);
  assert.deepEqual(a, { '2026-11-04': { de: { n: 5, new: 2, again: 1 } } }, 'input not changed');
});

await test('mergeLogs skips entries that are not a study log', () => {
  const junk = { 'not-a-date': { de: { n: 3 } }, '2026-11-05': { de: { n: -1 }, ja: 'x', en: { n: 2.5 } }, '2026-11-06': { de: { n: '4', new: 1 } } };
  assert.deepEqual(mergeLogs({}, junk), { log: {}, days: 0 });
  assert.deepEqual(mergeLogs({}, null), { log: {}, days: 0 });
});

await test('onlyLang keeps one course', () => {
  const log = { '2026-11-04': { de: { n: 1, new: 0, again: 0 }, ja: { n: 2, new: 0, again: 0 } }, '2026-11-05': { ja: { n: 1, new: 0, again: 0 } } };
  assert.deepEqual(onlyLang(log, 'de'), { '2026-11-04': { de: { n: 1, new: 0, again: 0 } } });
});

await test('store: answers are saved, exported with progress, and imported by merging', async () => {
  const mem = new Map();
  globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
  const store = await import('../js/store.js');
  const now = new Date(2026, 10, 5, 12).getTime();
  store.logAnswer({ lang: 'de', isNew: true, now });
  store.logAnswer({ lang: 'de', again: true, now });
  store.logAnswer({ lang: 'ja', now });
  assert.deepEqual(JSON.parse(mem.get('gk.studylog.v1')), {
    '2026-11-05': { de: { n: 2, new: 1, again: 1 }, ja: { n: 1, new: 0, again: 0 } },
  });
  assert.equal(store.buildExport({}).studyLog, undefined, 'only with progress');
  assert.deepEqual(Object.keys(store.buildExport({ includeProgress: true }).studyLog['2026-11-05']), ['de', 'ja']);
  assert.deepEqual(Object.keys(store.buildExport({ lang: 'ja', includeProgress: true }).studyLog['2026-11-05']), ['ja']);

  const file = { format: store.FORMAT, version: store.VERSION, cards: [], studyLog: { '2026-11-01': { de: { n: 7, new: 0, again: 0 } }, '2026-11-05': { de: { n: 1, new: 0, again: 0 } } } };
  const parsed = store.parseImport(JSON.stringify(file));
  const r = store.applyImport(parsed, { overwrite: false });
  assert.equal(r.logDays, 2);
  assert.equal(store.getStudyLog()['2026-11-01'].de.n, 7);
  assert.equal(store.getStudyLog()['2026-11-05'].de.n, 2, 'not lowered by an older file');
  store.applyImport(store.parseImport(JSON.stringify(file)), { overwrite: true });
  assert.equal(store.getStudyLog()['2026-11-01'].de.n, 7, 'importing twice does not double');
});

console.log(`\n${passed} passed`);
