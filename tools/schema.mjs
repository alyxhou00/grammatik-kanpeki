// Print the authoring schema for a topic, or a ready-to-paste prompt for an LLM.
//
//   node tools/schema.mjs                                   list courses and topics
//   node tools/schema.mjs ja verb-conjugation               the topic's authoring JSON Schema
//   node tools/schema.mjs ja verb-conjugation --prompt      a prompt: brief, rules, an example card,
//                                                           existing cards to avoid, and the schema
//   node tools/schema.mjs ja verb-conjugation --prompt --count 20
//
// Everything comes from the topic's entry in js/topics.js, so a new topic works here as soon as it
// is added there. Check what comes back with tools/validate.mjs.
import { LANGS, topicOf, topicType, deckIds, usesRuby, isRecall } from '../js/topics.js';
import { authoringSchema, toAuthoring, AUTHORING_FORMAT } from '../js/authoring.js';
import { toSurface } from '../js/text.js';
import { bundledCards } from './bundled.mjs';

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name, fallback) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : fallback; };
const [lang, topic] = args.filter((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--count'));

if (!lang || !topic) {
  console.log('Usage: node tools/schema.mjs <course> <topic> [--prompt [--count N]]\n');
  for (const [id, L] of Object.entries(LANGS)) {
    console.log(`${id}  ${L.label}`);
    for (const tp of L.topics) console.log(`    ${tp.id.padEnd(28)} ${topicType(id, tp.id).padEnd(8)} ${tp.label.replace(/­/g, '')}`);
  }
  process.exit(lang ? 1 : 0);
}
if (!topicOf(lang, topic)) {
  console.error(`Unknown topic "${lang}/${topic}". Run node tools/schema.mjs to list them.`);
  process.exit(1);
}

const schema = authoringSchema(lang, topic);
if (!flag('--prompt')) {
  console.log(JSON.stringify(schema, null, 2));
  process.exit(0);
}

// ---------- prompt for an LLM ----------

const count = Number(option('--count', 10));
const L = LANGS[lang];
const tp = topicOf(lang, topic);
const everything = bundledCards();
const all = everything.filter((c) => c.language === lang);
const type = topicType(lang, topic);
// An example of the same card type: from this topic, else another topic of this course, else another course.
const example = all.find((c) => c.topic === topic)
  || all.find((c) => topicType(lang, c.topic) === type)
  || everything.find((c) => topicType(c.language, c.topic) === type);
const existing = all.filter((c) => deckIds(lang, topic).includes(c.topic))
  .map((c) => toSurface(c.prompt.source || c.prompt.sentence || c.prompt.word));

const lines = [
  `Write ${count} new flashcards for "Grammatik Kanpeki", a grammar trainer.`,
  '',
  `Course: ${L.label} (${lang}). Topic: ${tp.label.replace(/­/g, '')} (${topic}).`,
  schema.description,
  '',
  'Rules:',
  `- Answer with one JSON object that follows the JSON Schema at the end, and nothing else: "format": "${AUTHORING_FORMAT}", "language": "${lang}", "topic": "${topic}", and the cards.`,
  '- Every field is described in the schema. Leave out optional fields you have nothing good for; do not add fields that are not in it.',
  ...(isRecall(type) ? [
    '- Each card is worth learning on its own. Vary the vocabulary, grammar and situations.',
  ] : [
    '- Each card practises one point. Vary the sentences, vocabulary and the forms asked for.',
    '- Put every fully correct answer in answer.accepted, or a learner who types it is told they are wrong.',
    '- A mistake must be a real typical error, never something that is also correct.',
  ]),
  ...(usesRuby(lang) ? ['- Furigana: write every kanji with its reading, {漢字|かんじ} (e.g. {食|た}べる, {朝|あさ}ごはん). Kana answers are only recognized through these readings, so get them right.'] : []),
  '',
];
if (example) {
  const from = example.language !== lang
    ? ` (from the ${LANGS[example.language].label} course: copy its structure only, not its language)`
    : example.topic !== topic ? ` (from the topic "${example.topic}")` : '';
  lines.push(`An existing card of this kind${from}, in the same format:`, '', JSON.stringify(toAuthoring(example), null, 2), '');
}
if (existing.length) {
  lines.push('These sentences already have cards; do not repeat them:', ...existing.slice(0, 40).map((x) => `- ${x}`), '');
}
lines.push('JSON Schema:', '', JSON.stringify(schema, null, 2));
console.log(lines.join('\n'));
