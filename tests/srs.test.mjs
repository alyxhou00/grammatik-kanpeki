// Checks js/srs.js against Anki's default scheduler.
// Run: node tests/srs.test.mjs
// Expected values come from Anki's source (rslib/src/scheduler/states/*.rs) and its unit tests.
import assert from 'node:assert/strict';
import { answer, preview, fuzzBounds, leechThresholdMet, DEFAULTS, dayStartMs, dayIndex, demoLast, reviewQueue } from '../js/srs.js';

const noFuzz = { ...DEFAULTS, fuzz: false };
let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log(`ok - ${name}`); };

/** Answer a card repeatedly, each time exactly when it is due. Returns the delays as text. */
function run(seq, cfg = noFuzz) {
  let now = dayStartMs(20000, cfg) + 3600e3;
  let st = null;
  const out = [];
  for (const g of seq) {
    st = answer(st, g, { now, cardId: 'x', cfg });
    out.push(st.type === 'review' ? `${st.ivl}d` : `${(st.due - now) / 60000}m`);
    now = st.type === 'review' ? dayStartMs(st.dueDay, cfg) + 3600e3 : st.due;
  }
  return out.join(' ');
}

test('new card, Good every time', () => assert.equal(run(['good', 'good', 'good', 'good', 'good', 'good']), '10m 1d 3d 8d 20d 50d'));
test('Hard on first step = average of 1m and 10m', () => assert.equal(run(['hard', 'good', 'good', 'good']), '5.5m 10m 1d 3d'));
test('Easy graduates at 4 days and keeps ease 2.5', () => assert.equal(run(['easy', 'good', 'good']), '4d 10d 25d'));
test('lapse: 10m relearning step, then 1 day, reduced ease', () => assert.equal(run(['good', 'good', 'good', 'good', 'again', 'good', 'good']), '10m 1d 3d 8d 10m 1d 3d'));
test('Hard x1.2 and Easy x1.3 on review cards', () => assert.equal(run(['good', 'good', 'good', 'good', 'hard', 'hard', 'easy']), '10m 1d 3d 8d 10d 12d 34d'));
test('relearning Hard with one step = 1.5 x 10m', () => assert.equal(run(['good', 'good', 'good', 'again', 'hard']), '10m 1d 3d 10m 15m'));
test('relearning Easy = lapse interval + 1 day', () => assert.equal(run(['good', 'good', 'good', 'again', 'easy']), '10m 1d 3d 10m 2d'));

test('late review adds half the delay (Good) or all of it (Easy)', () => {
  const st = { type: 'review', ivl: 10, ease: 2.5, dueDay: 100, lastDay: 90, reps: 5, lapses: 0 };
  const p = preview(st, { now: dayStartMs(104) + 3600e3, cardId: 'x', cfg: noFuzz });
  assert.deepEqual([p.hard.value, p.good.value, p.easy.value], [12, 30, 46]);
});

test('fuzz ranges match Anki tests (7 → 5..9, 17 → 14..20, 37 → 33..41)', () => {
  assert.deepEqual(fuzzBounds(7, 1, 36500), [5, 9]);
  assert.deepEqual(fuzzBounds(17, 1, 36500), [14, 20]);
  assert.deepEqual(fuzzBounds(37, 1, 36500), [33, 41]);
  assert.deepEqual(fuzzBounds(2, 1, 36500), [2, 2]);
});

test('fuzzed intervals stay in range, and the button preview equals the result', () => {
  const st = { type: 'review', ivl: 20, ease: 2.5, dueDay: 100, lastDay: 80, reps: 5, lapses: 0 };
  const now = dayStartMs(100) + 3600e3;
  for (const id of ['a', 'b', 'c', 'd', 'e']) {
    const p = preview(st, { now, cardId: id });
    for (const g of ['hard', 'good', 'easy']) assert.equal(p[g].value, answer(st, g, { now, cardId: id }).ivl);
    const [lo, hi] = fuzzBounds(50, 25, 36500);
    assert.ok(p.good.value >= lo && p.good.value <= hi);
  }
});

test('leech at 8 lapses, then every 4', () => {
  const hits = Array.from({ length: 20 }, (_, i) => i + 1).filter((l) => leechThresholdMet(l, 8));
  assert.deepEqual(hits, [8, 12, 16, 20]);
});

test('ease never drops below 1.3', () => {
  let st = { type: 'review', ivl: 10, ease: 1.4, dueDay: 100, lastDay: 90, reps: 5, lapses: 0 };
  st = answer(st, 'hard', { now: dayStartMs(100) + 3600e3, cfg: noFuzz });
  assert.equal(st.ease, 1.3);
});

test('the day starts at 4 AM', () => {
  assert.equal(dayIndex(new Date(2026, 10, 4, 3, 59).getTime()) + 1, dayIndex(new Date(2026, 10, 4, 4, 0).getTime()));
});

// ---------- queue order: real cards before demo cards ----------
// Ids starting with "d" stand for demo cards.
const isDemoId = (id) => id.startsWith('d');

test('demoLast keeps order inside each group', () => {
  assert.deepEqual(demoLast(['d1', 'r1', 'd2', 'r2'], isDemoId), ['r1', 'r2', 'd1', 'd2']);
});

test('review queue: all real cards (reviews mixed with new) before any demo card', () => {
  const q = reviewQueue(['d1', 'r1', 'r2'], ['dn1', 'rn1'], { reviewLimit: 10, newLimit: 10, isDemo: isDemoId });
  assert.deepEqual(q, ['r1', 'rn1', 'r2', 'd1', 'dn1']);
});

test('daily limits are filled with real cards first', () => {
  const q = reviewQueue(['d1', 'd2', 'r1'], ['dn1', 'dn2', 'rn1'], { reviewLimit: 2, newLimit: 1, isDemo: isDemoId });
  assert.deepEqual(q, ['r1', 'rn1', 'd1']);
});

console.log(`\n${passed} passed`);
