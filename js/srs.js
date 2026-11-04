// Anki's default scheduler (SM-2 based, FSRS off), ported from
// ankitects/anki rslib/src/scheduler/states/{learning,review,relearning,steps,fuzz}.rs
// and the defaults in rslib/src/deckconfig/mod.rs.
//
// Not ported: FSRS, the load balancer (it only picks which day inside the fuzz range),
// "easy days", and multi-day learning steps (the default steps are 1m and 10m).

export const DEFAULTS = {
  learnSteps: [1, 10],      // minutes
  relearnSteps: [10],       // minutes
  graduatingGood: 1,        // days
  graduatingEasy: 4,        // days
  initialEase: 2.5,
  easyBonus: 1.3,
  hardFactor: 1.2,
  intervalModifier: 1.0,
  maxInterval: 36500,       // days
  lapseMultiplier: 0.0,     // "New interval" after a lapse
  minLapseInterval: 1,      // days
  leechThreshold: 8,
  newPerDay: 20,
  reviewsPerDay: 200,
  dayStartHour: 4,          // "Next day starts at"
  learnAheadMins: 20,
  fuzz: true,
};

const MIN = 60 * 1000;
const DAY_MS = 24 * 60 * MIN;
const MINIMUM_EASE = 1.3;
const EASE_AGAIN = -0.2;
const EASE_HARD = -0.15;
const EASE_EASY = 0.15;

const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

// ---------- days ----------
// A "day" runs from dayStartHour to dayStartHour (local time), numbered consecutively.

export function dayIndex(t = Date.now(), cfg = DEFAULTS) {
  // Compare the local clock hour, not "t minus 4 hours": on the night summer time starts,
  // 4 AM is only 3 hours after midnight.
  const d = new Date(t);
  const day = Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY_MS);
  return d.getHours() < cfg.dayStartHour ? day - 1 : day;
}

/** Local timestamp when the given day number begins. */
export function dayStartMs(day, cfg = DEFAULTS) {
  const d = new Date(day * DAY_MS);
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), cfg.dayStartHour).getTime();
}

// ---------- fuzz (fuzz.rs) ----------

const FUZZ_RANGES = [
  { start: 2.5, end: 7, factor: 0.15 },
  { start: 7, end: 20, factor: 0.1 },
  { start: 20, end: Infinity, factor: 0.05 },
];

export function fuzzDelta(interval) {
  if (interval < 2.5) return 0;
  return FUZZ_RANGES.reduce((d, r) => d + r.factor * Math.max(0, Math.min(interval, r.end) - r.start), 1);
}

export function fuzzBounds(interval, minimum, maximum) {
  minimum = Math.min(minimum, maximum);
  interval = clamp(interval, minimum, maximum);
  const delta = fuzzDelta(interval);
  let lower = clamp(Math.round(interval - delta), minimum, maximum);
  let upper = clamp(Math.round(interval + delta), minimum, maximum);
  if (upper === lower && upper > 2 && upper < maximum) upper = lower + 1;
  return [lower, upper];
}

/** Deterministic per card and review count, like Anki (so the button preview equals the result). */
function fuzzFactor(seed) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
  h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

function minMax(cfg, minimum) {
  const maximum = Math.max(1, cfg.maxInterval);
  return [clamp(minimum, 1, maximum), maximum];
}

function withReviewFuzz(ctx, interval, minimum, maximum) {
  if (ctx.fuzzFactor == null) return clamp(Math.round(interval), minimum, maximum);
  const [lower, upper] = fuzzBounds(interval, minimum, maximum);
  return Math.floor(lower + ctx.fuzzFactor * (1 + upper - lower));
}

function constrainPassing(ctx, interval, minimum, fuzz) {
  interval *= ctx.cfg.intervalModifier;
  const [min, max] = minMax(ctx.cfg, minimum);
  return fuzz ? withReviewFuzz(ctx, interval, min, max) : clamp(Math.round(interval), min, max);
}

// ---------- steps (steps.rs) ----------

const stepIndex = (steps, left) => clamp(steps.length - left, 0, steps.length - 1);
const roundInDays = (secs) => (secs > 86400 ? Math.round(secs / 86400) * 86400 : secs);

function hardDelaySecs(steps, left) {
  const idx = stepIndex(steps, left);
  const again = Math.floor(steps[0] * 60);
  if (idx === 0) {
    if (steps.length > 1) return roundInDays(Math.floor((again + Math.floor(steps[1] * 60)) / 2));
    return Math.min(Math.floor((again * 3) / 2), again + 86400);
  }
  return Math.floor(steps[idx] * 60);
}

function goodDelaySecs(steps, left) {
  const idx = stepIndex(steps, left);
  return idx + 1 < steps.length ? Math.floor(steps[idx + 1] * 60) : null;
}

// ---------- states ----------

/**
 * State shapes:
 *   new        { type:'new' }
 *   learning   { type:'learning',   left, due(ms), ease }
 *   review     { type:'review',     ivl, dueDay, lastDay, ease }
 *   relearning { type:'relearning', left, due(ms), ivl, ease }
 * all carry reps, lapses, leech.
 */
export function normalize(st, cfg = DEFAULTS) {
  if (!st) return null;
  if (st.type) return st;
  // v1 state from the first version of this app: {reps, interval, ease, due, lapses, last}
  const base = { reps: st.reps || 0, lapses: st.lapses || 0, ease: st.ease || cfg.initialEase, leech: false };
  if (st.interval > 0) {
    return { ...base, type: 'review', ivl: Math.round(st.interval), dueDay: dayIndex(st.due, cfg), lastDay: dayIndex(st.last ?? st.due, cfg) };
  }
  return { ...base, type: 'learning', left: cfg.learnSteps.length, due: st.due || 0 };
}

function graduate(ctx, s, days, now) {
  const [min, max] = minMax(ctx.cfg, 1);
  const ivl = withReviewFuzz(ctx, Math.max(1, Math.round(days)), min, max);
  return { ...base(s), type: 'review', ease: s.ease, ivl, dueDay: ctx.today + ivl, lastDay: ctx.today };
}

const base = (s) => ({ reps: s.reps, lapses: s.lapses, leech: s.leech || false });

function answerLearning(ctx, s, grade, now) {
  const steps = ctx.cfg.learnSteps;
  const left = s.type === 'new' ? steps.length : s.left;
  const ease = s.type === 'new' ? ctx.cfg.initialEase : s.ease;
  const cur = { ...s, ease };
  const learn = (secs, l) => ({ ...base(s), type: 'learning', left: l, due: now + secs * 1000, ease });
  if (!steps.length) return graduate(ctx, cur, grade === 'easy' ? ctx.cfg.graduatingEasy : ctx.cfg.graduatingGood, now);
  switch (grade) {
    case 'again': return learn(Math.floor(steps[0] * 60), steps.length);
    case 'hard': return learn(hardDelaySecs(steps, left), left);
    case 'good': {
      const d = goodDelaySecs(steps, left);
      return d != null ? learn(d, left - 1) : graduate(ctx, cur, ctx.cfg.graduatingGood, now);
    }
    default: return graduate(ctx, cur, ctx.cfg.graduatingEasy, now);
  }
}

export function leechThresholdMet(lapses, threshold) {
  if (threshold <= 0) return false;
  const half = Math.max(1, Math.ceil(threshold / 2));
  return lapses >= threshold && (lapses - threshold) % half === 0;
}

function failingInterval(ctx, ivl) {
  const [min, max] = minMax(ctx.cfg, ctx.cfg.minLapseInterval);
  return withReviewFuzz(ctx, Math.max(ivl, 1) * ctx.cfg.lapseMultiplier, min, max);
}

function answerReview(ctx, s, grade, now) {
  const cfg = ctx.cfg;
  if (grade === 'again') {
    const lapses = s.lapses + 1;
    const ease = Math.max(MINIMUM_EASE, s.ease + EASE_AGAIN);
    const ivl = failingInterval(ctx, s.ivl);
    const leech = s.leech || leechThresholdMet(lapses, cfg.leechThreshold);
    const steps = cfg.relearnSteps;
    if (steps.length) {
      return { reps: s.reps, lapses, leech, type: 'relearning', left: steps.length, due: now + Math.floor(steps[0] * 60) * 1000, ivl, ease };
    }
    return { reps: s.reps, lapses, leech, type: 'review', ivl, ease, dueDay: ctx.today + ivl, lastDay: ctx.today };
  }

  const S = Math.max(s.ivl, 1);
  const elapsed = ctx.today - s.lastDay;
  const daysLate = elapsed - s.ivl;
  const EF = s.ease;
  const HM = cfg.hardFactor;
  const EM = cfg.easyBonus;
  let hard; let good; let easy;
  if (daysLate < 0) {
    // early review (review.rs: passing_early_review_intervals)
    const reduced = EM - (EM - 1) / 2;
    hard = constrainPassing(ctx, Math.max(elapsed * HM, (S * HM) / 2), 0, false);
    good = constrainPassing(ctx, Math.max(elapsed * EF, S), 0, false);
    easy = constrainPassing(ctx, Math.max(elapsed * EF, S) * reduced, 0, false);
  } else {
    const L = Math.max(daysLate, 0);
    hard = constrainPassing(ctx, S * HM, HM <= 1 ? 0 : S + 1, true);
    good = constrainPassing(ctx, (S + L / 2) * EF, HM <= 1 ? S + 1 : hard + 1, true);
    easy = constrainPassing(ctx, (S + L) * EF * EM, good + 1, true);
  }
  const next = (ivl, ease) => ({ ...base(s), type: 'review', ivl, ease, dueDay: ctx.today + ivl, lastDay: ctx.today });
  if (grade === 'hard') return next(hard, Math.max(MINIMUM_EASE, EF + EASE_HARD));
  if (grade === 'good') return next(good, EF);
  return next(easy, EF + EASE_EASY);
}

function answerRelearning(ctx, s, grade, now) {
  const steps = ctx.cfg.relearnSteps;
  const toReview = (ivl) => ({ ...base(s), type: 'review', ivl, ease: s.ease, dueDay: ctx.today + ivl, lastDay: ctx.today });
  const relearn = (secs, left, ivl = s.ivl) => ({ ...base(s), type: 'relearning', left, due: now + secs * 1000, ivl, ease: s.ease });
  switch (grade) {
    case 'again':
      if (!steps.length) return toReview(failingInterval(ctx, s.ivl));
      return relearn(Math.floor(steps[0] * 60), steps.length, failingInterval(ctx, s.ivl));
    case 'hard':
      return steps.length ? relearn(hardDelaySecs(steps, s.left), s.left) : toReview(s.ivl);
    case 'good': {
      const d = steps.length ? goodDelaySecs(steps, s.left) : null;
      return d != null ? relearn(d, s.left - 1) : toReview(s.ivl);
    }
    default:
      return toReview(s.ivl + 1);
  }
}

/** Apply an answer. Returns the new state. */
export function answer(prev, grade, { now = Date.now(), cardId = '', cfg = DEFAULTS } = {}) {
  const s = normalize(prev, cfg) || { type: 'new', reps: 0, lapses: 0, leech: false };
  const ctx = { cfg, today: dayIndex(now, cfg), fuzzFactor: cfg.fuzz ? fuzzFactor(`${cardId}:${s.reps}`) : null };
  let next;
  if (s.type === 'new' || s.type === 'learning') next = answerLearning(ctx, s, grade, now);
  else if (s.type === 'review') next = answerReview(ctx, s, grade, now);
  else next = answerRelearning(ctx, s, grade, now);
  next.reps = s.reps + 1;
  next.last = now;
  return next;
}

/** What each button would do: {kind:'min'|'day', value}. */
export function preview(prev, opts = {}) {
  const now = opts.now ?? Date.now();
  const out = {};
  for (const g of ['again', 'hard', 'good', 'easy']) {
    const n = answer(prev, g, { ...opts, now });
    out[g] = n.type === 'review' ? { kind: 'day', value: n.ivl } : { kind: 'min', value: (n.due - now) / MIN };
  }
  return out;
}

// ---------- queue helpers ----------

export const isNew = (st) => !st || st.type === 'new';
export const isLearning = (st) => !!st && (st.type === 'learning' || st.type === 'relearning');
export const isReviewDue = (st, now = Date.now(), cfg = DEFAULTS) => !!st && st.type === 'review' && st.dueDay <= dayIndex(now, cfg);
export const learningDueToday = (st, now = Date.now(), cfg = DEFAULTS) => isLearning(st) && st.due < dayStartMs(dayIndex(now, cfg) + 1, cfg);

/** Items for which isDemo is false first, then the demo ones; order inside each group is kept. */
export function demoLast(items, isDemo) {
  return [...items.filter((x) => !isDemo(x)), ...items.filter((x) => isDemo(x))];
}

/** Spread new cards evenly between reviews, as Anki does. */
export function mixIn(reviews, news) {
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

/**
 * The day's review queue. due: review cards, most overdue first; fresh: new cards in deck order.
 * Real cards fill the daily limits first and are all shown before any demo card.
 */
export function reviewQueue(due, fresh, { reviewLimit, newLimit, isDemo = () => false }) {
  const d = demoLast(due, isDemo).slice(0, reviewLimit);
  const f = demoLast(fresh, isDemo).slice(0, newLimit);
  const real = (x) => !isDemo(x);
  return [
    ...mixIn(d.filter(real), f.filter(real)),
    ...mixIn(d.filter(isDemo), f.filter(isDemo)),
  ];
}
