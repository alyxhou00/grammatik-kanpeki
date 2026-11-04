// Text-to-speech through the browser's Web Speech API (no server, no key).
//
// Language-agnostic: a course turns it on with `speech: { locale, rate }` in js/topics.js, and this
// module picks a voice for that locale. Which voices exist depends on the browser and the OS
// (Edge has "Natural" online voices, Chrome has "Google 日本語 / Deutsch", Windows and macOS ship
// offline voices once the language's speech pack is installed).
//
// Furigana markup is read as written in kanji ({箸|はし} → 箸): the engine needs the word, not only
// its kana, to pick the right pitch accent (箸 and 橋 are both はし but sound different).
import { toSurface, BLANK } from './text.js';

const synth = typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null;

export const supported = () => !!synth;

/** The text the engine gets: kanji spelling, no blank marker, single spaces. */
export function speechText(s) {
  return toSurface(s).replaceAll(BLANK, '').replace(/\s+/g, ' ').trim();
}

// Android reports "ja_JP"; everyone else "ja-JP".
const norm = (tag) => String(tag || '').replace('_', '-').toLowerCase();
const base = (tag) => norm(tag).split('-')[0];

// Online / neural voices sound far more natural than the old offline ones, so "automatic" prefers them.
const NICE = /natural|neural|online|google|premium|enhanced|siri/i;

/** Voices for a locale's language, best first: natural voices, then the exact region, then the rest. */
export function voicesFor(locale) {
  if (!synth) return [];
  const want = norm(locale);
  const score = (v) => (NICE.test(v.name) ? 4 : 0) + (norm(v.lang) === want ? 2 : 0) + (v.localService ? 0 : 1);
  return synth.getVoices()
    .filter((v) => base(v.lang) === base(locale))
    .sort((a, b) => score(b) - score(a) || a.name.localeCompare(b.name));
}

/** The chosen voice if it still exists, else the best one. */
export function pickVoice(locale, voiceURI) {
  const list = voicesFor(locale);
  return list.find((v) => v.voiceURI === voiceURI) || list[0] || null;
}

export const canSpeak = (locale) => !!locale && voicesFor(locale).length > 0;

let current = null; // keep a reference: Chrome drops callbacks of utterances that were garbage-collected

/**
 * Read `text` aloud. `onEnd` runs when it finishes or is interrupted.
 * Starting a new one stops the one that is playing.
 */
export function speak(text, { locale, voiceURI, rate = 1, onEnd } = {}) {
  if (!synth) return false;
  const say = speechText(text);
  if (!say) return false;
  stop();
  const u = new SpeechSynthesisUtterance(say);
  u.lang = locale;
  const voice = pickVoice(locale, voiceURI);
  if (voice) u.voice = voice;
  u.rate = rate;
  let finished = false; // cancel() fires onend or onerror in some browsers, and stop() calls it too
  const done = () => {
    if (finished) return;
    finished = true;
    if (current === u) current = null;
    onEnd?.();
  };
  u.onend = done;
  u.onerror = done;
  current = u;
  synth.speak(u);
  return true;
}

export function stop() {
  if (!synth) return;
  const u = current;
  current = null;
  synth.cancel();
  u?.onend?.();
}

/** Voices load asynchronously (Chrome starts with an empty list). */
export function onVoicesChanged(cb) {
  synth?.addEventListener?.('voiceschanged', cb);
}
