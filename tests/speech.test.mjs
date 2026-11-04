// Read-aloud: what text the engine gets, and which voice "automatic" picks.
// Run: node tests/speech.test.mjs
import assert from 'node:assert/strict';
import { LANGS } from '../js/topics.js';

// A fake Web Speech API, installed before js/speech.js is loaded.
const VOICES = [
  { name: 'Microsoft Haruka - Japanese (Japan)', lang: 'ja-JP', voiceURI: 'haruka', localService: true },
  { name: 'Microsoft Nanami Online (Natural) - Japanese (Japan)', lang: 'ja-JP', voiceURI: 'nanami', localService: false },
  { name: 'Microsoft Hedda - German (Germany)', lang: 'de-DE', voiceURI: 'hedda', localService: true },
  { name: 'Microsoft Karsten - German (Switzerland)', lang: 'de_CH', voiceURI: 'karsten', localService: true },
];
const spoken = [];
globalThis.window = {
  speechSynthesis: {
    getVoices: () => VOICES,
    speak: (u) => spoken.push(u),
    cancel: () => {},
  },
};
globalThis.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };

const speech = await import('../js/speech.js');

// Furigana is read as kanji (the engine needs the word for its pitch accent).
assert.equal(speech.speechText('{朝|あさ}ごはんはあまり{食|た}べない。', 'ja-JP'), '朝ごはんはあまり食べない。');
// A blank is a pause, never the answer; a pause at the start or before punctuation is dropped.
assert.equal(speech.speechText('{私|わたし}は___{学生|がくせい}です。', 'ja-JP'), '私は、学生です。');
assert.equal(speech.speechText('{朝|あさ}ごはんはあまり___。', 'ja-JP'), '朝ごはんはあまり。');
assert.equal(speech.speechText('___{日本|にほん}{人|じん}です', 'ja-JP'), '日本人です');
assert.equal(speech.speechText('  Er wartet ___ den Bus. ', 'de-DE'), 'Er wartet, den Bus.');
assert.equal(speech.speechText('Ich helfe ___', 'de-DE'), 'Ich helfe');

// Natural voices first; regions of the same language count ("de_CH" as Android writes it, too).
assert.deepEqual(speech.voicesFor('ja-JP').map((v) => v.voiceURI), ['nanami', 'haruka']);
assert.deepEqual(speech.voicesFor('de-DE').map((v) => v.voiceURI), ['hedda', 'karsten']);
assert.equal(speech.pickVoice('ja-JP', 'haruka').voiceURI, 'haruka');
assert.equal(speech.pickVoice('ja-JP', 'gone').voiceURI, 'nanami', 'a removed voice falls back to the best one');
assert.equal(speech.canSpeak('fr-FR'), false);

// Every course has a voice locale and a sane default speed.
for (const [lang, L] of Object.entries(LANGS)) {
  assert.match(L.speech.locale, /^[a-z]{2}-[A-Z]{2}$/, lang);
  assert.ok(L.speech.rate > 0.3 && L.speech.rate <= 2, lang);
}

// speak() sets language, voice and speed, and reports the end once even when stopped.
let ends = 0;
assert.equal(speech.speak('{箸|はし}', { locale: 'ja-JP', rate: 0.85, onEnd: () => ends++ }), true);
const u = spoken.at(-1);
assert.deepEqual([u.text, u.lang, u.voice.voiceURI, u.rate], ['箸', 'ja-JP', 'nanami', 0.85]);
speech.stop();
u.onend();
assert.equal(ends, 1);
assert.equal(speech.speak('___', { locale: 'ja-JP' }), false, 'nothing to say');

console.log('ok - speech: text, voice ranking, course config, speak/stop');
