// Pitch accent: morae, high/low levels, the markup, and the lookup in the bundled data.
// Run: node tests/pitch.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { SHARDS, shardOf, shardName, hira, morae, levels, accentType, pitchHTML, accentsIn, lookup, readingHTML } from '../js/pitch.js';
import { LANGS } from '../js/topics.js';

// Small kana join the mora before them; っ, ん and ー count on their own.
assert.deepEqual(morae('きょうと'), ['きょ', 'う', 'と']);
assert.deepEqual(morae('がっこう'), ['が', 'っ', 'こ', 'う']);
assert.deepEqual(morae('コーヒー'), ['コ', 'ー', 'ヒ', 'ー']);
assert.deepEqual(morae('ファン'), ['ファ', 'ン']);
assert.equal(hira('コーヒー'), 'こーひー');

// The three はし from the textbook chart, with the particle after them (H = high, L = low).
const hl = (count, accent) => levels(count, accent).map((h) => (h ? 'H' : 'L')).join('');
assert.equal(hl(2, 1), 'HLL', '箸 はしが: 頭高');
assert.equal(hl(2, 2), 'LHL', '橋 はしが: 尾高, drops at the particle');
assert.equal(hl(2, 0), 'LHH', '端 はしが: 平板, stays high');
assert.equal(hl(3, 2), 'LHLL', 'たべる: 中高');
assert.equal(hl(1, 0), 'LH', 'ひ (日): one mora, flat');
assert.equal(hl(1, 1), 'HL', 'き (木)');
assert.equal(levels(2, 3), null, 'an accent past the last mora does not fit');
assert.deepEqual([accentType(2, 0), accentType(2, 1), accentType(3, 2), accentType(2, 2)], ['平板型', '頭高型', '中高型', '尾高型']);

// Markup: a step where the level changes, and an empty tail for the particle.
assert.equal(pitchHTML('はし', 2),
  '<span class="pitch" title="尾高型 [2]"><span class="m l">は</span><span class="m h step">し</span><span class="m tail l step" aria-hidden="true"></span></span>');
assert.equal(pitchHTML('はし', 5), '');

// Lookup by spelling and reading; a word in kana only when the reading is unambiguous.
const table = { はし: { 箸: [1], 橋: [2], 端: [0] }, すごい: { 凄い: [2] }, こーひー: { コーヒー: [3] } };
assert.deepEqual(accentsIn(table, '{箸|はし}'), [1]);
assert.deepEqual(accentsIn(table, '{端|はし}'), [0]);
assert.equal(accentsIn(table, 'はし'), null, 'はし alone could be any of three');
assert.deepEqual(accentsIn(table, 'すごい'), [2], 'すごい is 凄い, the only word read すごい');
assert.equal(accentsIn(table, '{凄|す}ごく'), null, 'a form that is not in the data');
assert.deepEqual(accentsIn(table, 'コーヒー'), [3]);
assert.equal(accentsIn(table, '{嘴|はし}'), null, 'a kanji spelling not in the table');

// The reading element: asks for its accent only with data, and can wait hidden.
assert.equal(readingHTML('{薬|くすり}', 'ja', 'pop-reading', { dir: 'data/pitch/ja' }),
  '<div class="pop-reading" lang="ja" data-pitch="{薬|くすり}" data-pitch-dir="data/pitch/ja">くすり</div>');
assert.equal(readingHTML('{薬|くすり}', 'ja', 'pop-reading'), '<div class="pop-reading" lang="ja">くすり</div>');
assert.match(readingHTML('あまり', 'ja', 'x', { dir: 'd', hidden: true }), / hidden>/);

// The bundled data: every file is there, each reading sits in the file its hash names, and the
// chart's words come out right.
const dir = LANGS.ja.pitch;
assert.equal(LANGS.de.pitch, '');
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
assert.equal(files.length, SHARDS);
const sample = JSON.parse(fs.readFileSync(`${dir}/${shardName(7)}`, 'utf8'));
for (const reading of Object.keys(sample).slice(0, 50)) assert.equal(shardOf(reading), 7, reading);

globalThis.fetch = async (url) => ({ ok: fs.existsSync(url), json: async () => JSON.parse(fs.readFileSync(url, 'utf8')) });
const chart = { '{箸|はし}': 1, '{橋|はし}': 2, '{端|はし}': 0, '{雨|あめ}': 1, '{飴|あめ}': 0, '{鮭|さけ}': 1, '{山|やま}': 2, '{花|はな}': 2, '{鼻|はな}': 0, '{薬|くすり}': 0, '{食|た}べる': 2 };
for (const [word, accent] of Object.entries(chart)) assert.equal((await lookup(dir, word))?.[0], accent, word);
assert.equal(await lookup(dir, 'はし'), null);
assert.equal(await lookup('', '{箸|はし}'), null, 'a course without data');

console.log('ok - pitch: morae, levels, markup, lookup, bundled data');
