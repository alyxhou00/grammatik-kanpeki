// Check a card file before importing it, and turn an authoring file into an importable one.
//
//   node tools/validate.mjs cards.json                     check it; exit code 1 if anything is wrong
//   node tools/validate.mjs new.json --out import.json     also write an importable card file (only when all is fine)
//
// Accepts an authoring file (grammatik-kanpeki.authoring, see tools/schema.mjs) or a full card file
// (grammatik-kanpeki.cards, as exported by the app). It checks the same rules as the app and the data
// tests (js/cardcheck.js): fields, answer lists judged as labelled, hoverable words, facet values,
// furigana. Each problem is printed on one line with where it is, so a person or an LLM can fix it.
import fs from 'node:fs';
import { LANGS, topicOf } from '../js/topics.js';
import { AUTHORING_FORMAT, authoringSchema, checkSchema, cardsFromAuthoring } from '../js/authoring.js';
import { cardProblems } from '../js/cardcheck.js';
import { upgradeCard, FORMAT, VERSION } from '../js/store.js';
import { toSurface } from '../js/text.js';
import { bundledCards } from './bundled.mjs';

const args = process.argv.slice(2);
const outIndex = args.indexOf('--out');
const out = outIndex >= 0 ? args[outIndex + 1] : null;
const file = args.find((a, i) => !a.startsWith('--') && (outIndex < 0 || i !== outIndex + 1));
if (!file) {
  console.log('Usage: node tools/validate.mjs <file.json> [--out <importable.json>]');
  process.exit(1);
}

let data;
try {
  data = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, ''));
} catch (e) {
  console.error(`${file}: not valid JSON (${e.message})`);
  process.exit(1);
}

const problems = []; // [where, message]
const warnings = [];
const mainText = (c) => toSurface(c.prompt?.source || c.prompt?.sentence || c.prompt?.word || '');
const label = (i, c) => {
  const t = mainText(c);
  return `cards[${i}]${c?.id ? ` ${c.id}` : ''}${t ? ` "${t.length > 40 ? `${t.slice(0, 40)}…` : t}"` : ''}`;
};

let cards = [];
if (data?.format === AUTHORING_FORMAT) {
  if (!LANGS[data.language] || !topicOf(data.language, data.topic)) {
    console.error(`${file}: unknown course/topic "${data.language}/${data.topic}". Run node tools/schema.mjs to list them.`);
    process.exit(1);
  }
  const schema = authoringSchema(data.language, data.topic);
  // File-level fields first, then each card on its own (so one bad card does not hide the rest).
  const fileErrs = checkSchema({ ...schema, properties: { ...schema.properties, cards: { type: 'array', minItems: 1 } } }, data);
  for (const e of fileErrs) problems.push(['file', e]);
  if (Array.isArray(data.cards)) {
    const ok = [];
    data.cards.forEach((c, i) => {
      const errs = checkSchema(schema.properties.cards.items, c, `cards[${i}]`);
      if (errs.length) for (const e of errs) problems.push([label(i, c), e.replace(/^cards\[\d+\]\.?/, '') || e]);
      else ok.push([i, c]);
    });
    // Cards that pass the schema are turned into full cards and checked like the app's own.
    const full = cardsFromAuthoring({ ...data, cards: ok.map(([, c]) => c) });
    full.forEach((c, k) => { for (const e of cardProblems(c)) problems.push([label(ok[k][0], c), e]); });
    cards = full;
  }
} else if (data?.format === FORMAT || Array.isArray(data)) {
  const list = (Array.isArray(data) ? data : data.cards || []).map(upgradeCard);
  const ids = new Set();
  list.forEach((c, i) => {
    if (c?.id && ids.has(c.id)) problems.push([label(i, c), 'duplicate id in this file']);
    ids.add(c?.id);
    for (const e of cardProblems(c)) problems.push([label(i, c), e]);
  });
  cards = list;
} else {
  console.error(`${file}: "format" must be "${AUTHORING_FORMAT}" (new cards for one topic) or "${FORMAT}" (exported cards).`);
  process.exit(1);
}

// Repeats: the same sentence twice in the file, or one the app already has (a warning: a cloze
// sentence can be reused for another form on purpose).
const seen = new Map(bundledCards().map((c) => [`${c.language}|${mainText(c)}`, `bundled card ${c.id}`]));
cards.forEach((c, i) => {
  const k = `${c.language}|${mainText(c)}`;
  if (seen.has(k) && !seen.get(k).endsWith(` ${c.id}`)) warnings.push([label(i, c), `same text as ${seen.get(k)}`]);
  else seen.set(k, `cards[${i}]`);
});

for (const [where, msg] of problems) console.log(`✗ ${where}: ${msg}`);
for (const [where, msg] of warnings) console.log(`! ${where}: ${msg}`);
const bad = new Set(problems.map(([w]) => w)).size;
console.log(`${(Array.isArray(data) ? data : data.cards || []).length} card(s): ${problems.length ? `${problems.length} problem(s) in ${bad} place(s)` : 'all fine'}${warnings.length ? `, ${warnings.length} warning(s)` : ''}.`);

if (out) {
  if (problems.length) {
    console.log(`Not writing ${out}: fix the problems first.`);
  } else {
    fs.writeFileSync(out, `${JSON.stringify({ format: FORMAT, version: VERSION, cards }, null, 2)}\n`);
    console.log(`Wrote ${out}: import it with Import / Export in the app.`);
  }
}
process.exit(problems.length ? 1 : 0);
