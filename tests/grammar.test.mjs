// Checks the grammar guide (js/grammar.js): it fits the topic tree and every bundled card links to a place in it.
// Run: node tests/grammar.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { GUIDES, guideAnchor, guideTopics, anchorOf, guideRuby } from '../js/grammar.js';
import { LANGS, topicOf, formsOf } from '../js/topics.js';

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log(`ok - ${name}`); };

/** Every anchor the guide page renders, per language. */
function anchors(lang) {
  const out = new Set();
  for (const [topic, g] of Object.entries(GUIDES[lang] || {})) {
    out.add(anchorOf(topic));
    for (const s of g.sections) {
      out.add(anchorOf(topic, s.id));
      for (const it of s.items || []) out.add(anchorOf(topic, s.id, it.form || it.id));
    }
  }
  return out;
}

test('every course has a guide entry, and every guide belongs to a grammar topic of its course', () => {
  for (const lang of Object.keys(LANGS)) {
    assert.ok(GUIDES[lang], `${lang}: guide`);
    const listed = guideTopics(lang).map((x) => x.topic.id);
    for (const topic of Object.keys(GUIDES[lang])) {
      assert.ok(topicOf(lang, topic), `${lang}: guide for unknown topic ${topic}`);
      assert.ok(listed.includes(topic), `${lang}/${topic}: not a grammar topic`);
    }
  }
});

test('the word lists and sentence decks are not in the guide', () => {
  for (const lang of Object.keys(LANGS)) assert.ok(!guideTopics(lang).some((x) => ['vocab', 'sentences'].includes(x.topic.id)), lang);
});

test('section ids are unique within a topic, item ids within a section, and every item has a form or an id and title', () => {
  for (const [lang, guides] of Object.entries(GUIDES)) {
    for (const [topic, g] of Object.entries(guides)) {
      const ids = g.sections.map((s) => s.id);
      assert.equal(new Set(ids).size, ids.length, `${lang}/${topic}: duplicate section id`);
      for (const s of g.sections) {
        const items = (s.items || []).map((it) => it.form || it.id);
        assert.equal(new Set(items).size, items.length, `${lang}/${topic}/${s.id}: duplicate item`);
        for (const it of s.items || []) {
          assert.ok(it.form || (it.id && it.title), `${lang}/${topic}/${s.id}: item needs a form, or an id and a title`);
          assert.ok(it.body, `${lang}/${topic}/${s.id}/${it.form || it.id}: body`);
        }
      }
    }
  }
});

test('every form in a topic registry has exactly one item in its guide, and every item is a registered form', () => {
  for (const [lang, guides] of Object.entries(GUIDES)) {
    for (const [topic, g] of Object.entries(guides)) {
      const registry = formsOf(lang, topic);
      const items = g.sections.flatMap((s) => (s.items || []).filter((it) => it.form).map((it) => it.form));
      for (const form of items) assert.ok(registry[form], `${lang}/${topic}: item for unregistered form ${form}`);
      for (const form of Object.keys(registry)) {
        assert.equal(items.filter((x) => x === form).length, 1, `${lang}/${topic}: form ${form} needs one item`);
      }
    }
  }
});

test('every bundled card with a guide links to its form, and the anchor exists', () => {
  const manifest = JSON.parse(fs.readFileSync('data/manifest.json', 'utf8'));
  let linked = 0;
  for (const file of manifest.files) {
    for (const card of JSON.parse(fs.readFileSync(`data/${file}`, 'utf8')).cards) {
      const g = guideAnchor(card);
      if (!GUIDES[card.language]?.[card.topic]) continue;
      assert.ok(g, `${card.id}: no place in the guide`);
      assert.ok(anchors(card.language).has(g.anchor), `${card.id}: anchor ${g.anchor} is not on the page`);
      if (card.meta?.form) {
        assert.ok(g.anchor.endsWith(`--${card.meta.form}`), `${card.id}: links to ${g.anchor}, not its form`);
        assert.equal(g.title, formsOf(card.language, card.topic)[card.meta.form], `${card.id}: title is the form label`);
      }
      linked++;
    }
  }
  assert.ok(linked > 0, 'some bundled cards link to the guide');
});

test('a card without a form links to its topic; a topic without a guide gives no link', () => {
  assert.equal(guideAnchor({ language: 'ja', topic: 'verb-conjugation', meta: {} }).anchor, 'verb-conjugation');
  assert.equal(guideAnchor({ language: 'ja', topic: 'verb-conjugation', meta: { form: 'nope' } }).anchor, 'verb-conjugation');
  assert.equal(guideAnchor({ language: 'ja', topic: 'vocab' }), null);
  assert.equal(guideAnchor({ language: 'ja', topic: 'sentences' }), null);
  assert.equal(guideAnchor({ language: 'xx', topic: 'a' }), null);
});

test('furigana markup becomes ruby, and the guide has no markup left over', () => {
  assert.equal(guideRuby('{食|た}べる'), '<ruby>食<rt>た</rt></ruby>べる');
  // Kanji are written as {漢字|かな} only: a stray brace would show up on the page.
  for (const guides of Object.values(GUIDES)) {
    for (const g of Object.values(guides)) {
      const text = [g.intro || '', ...g.sections.flatMap((s) => [s.body || '', ...(s.items || []).map((i) => i.body)])].join('');
      assert.ok(!/[{}]/.test(guideRuby(text)), 'unmatched { or } in the guide');
    }
  }
});

console.log(`\n${passed} tests passed`);
