// Simple SM-2 style scheduler (Anki-like). Intervals are in days.
const DAY = 86400000;

export const startOfDay = (t = Date.now()) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
export const endOfDay = (t = Date.now()) => startOfDay(t) + DAY - 1;

export const isDue = (state, now = Date.now()) => !!state && state.due <= endOfDay(now);

export function schedule(prev, grade, now = Date.now()) {
  const s = prev ? { ...prev } : { reps: 0, interval: 0, ease: 2.5, due: 0, lapses: 0 };
  if (grade === 'again') {
    if (s.reps > 0) s.lapses += 1;
    s.reps = 0;
    s.interval = 0;
    s.ease = Math.max(1.3, s.ease - 0.2);
    s.due = now;
  } else {
    let iv;
    if (grade === 'hard') {
      iv = s.reps === 0 ? 1 : Math.max(s.interval + 1, Math.round(s.interval * 1.2));
      s.ease = Math.max(1.3, s.ease - 0.15);
    } else if (grade === 'good') {
      iv = s.reps === 0 ? 2 : Math.max(s.interval + 1, Math.round(s.interval * s.ease));
    } else {
      iv = s.reps === 0 ? 4 : Math.max(s.interval + 1, Math.round(s.interval * s.ease * 1.3));
      s.ease += 0.15;
    }
    s.reps += 1;
    s.interval = iv;
    s.due = startOfDay(now) + iv * DAY;
  }
  s.last = now;
  return s;
}

/** Interval in days each grade would give (0 = again, today). */
export function preview(prev) {
  const out = {};
  for (const g of ['again', 'hard', 'good', 'easy']) out[g] = schedule(prev, g).interval;
  return out;
}
