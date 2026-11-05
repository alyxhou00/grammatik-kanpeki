// Languages and topics. Data plus tree helpers: no DOM, so tests, the store and the answer checker can import it.
//
// LANGS[lang] is everything that differs between courses; the rest of the code reads these fields
// instead of asking which language it is. Every course sets every field (LANG_FIELDS, checked by
// tests/data.test.mjs), so a new course is a new entry here plus its UI strings in js/i18n.js.
//
// A topic is a deck in the sidebar. Topics form a tree through `parent`; a parent deck studies its
// own cards and the cards of every sub-topic (as in Anki). Each topic says which card type draws its
// cards (`type`, see js/cardtypes.js) and can set labels for that type; sub-topics inherit both.
//
// Topic fields:
//   id       unique within the language, used in the URL and in card.topic
//   label    sidebar name
//   parent   id of the parent topic (optional)
//   group    sidebar section: 'grammar' | 'vocab' (inherited from the parent; default 'grammar')
//   type     'rewrite' | 'cloze' | 'flip' (inherited from the parent)
//   labels   per-type labels, e.g. { source: 'Verbalstil', target: 'Nominalstil' } (merged with the parent's)
//   facets   names for card.meta values, shown as chips on the back: { verbClass: { godan: '…' } }
//   forms    the topic's registry of task labels: { 'te-kudasai': 'てください（請…）' }. A card says which one it
//            practises in meta.form, and its prompt.task must be exactly that label (js/cardcheck.js), so the
//            same form is never written two ways. Authoring files give only meta.form: the task is filled in
//            from here (js/authoring.js). Each id is one label: a pattern with two uses gets two ids.
//   about    what the exercise is and what makes a good card (English). It goes into the authoring
//            schema that people and LLMs write new cards from (tools/schema.mjs, js/authoring.js).

import { normalizeDe, normalizeJa } from './text.js';

export const CARD_TYPES = ['rewrite', 'cloze', 'flip'];

/** The course fields and their types. */
export const LANG_FIELDS = {
  label: 'string', // name in the course menu
  glyph: 'string', // badge in the course menu
  tagline: 'string', // course menu subtitle
  htmlLang: 'string', // <html lang> (the UI language)
  noteLang: 'string', // language of answer notes, hints and tasks
  translation: 'string', // 'aid': translations hidden behind a click | 'always': always shown
  explainLangs: 'object', // explanation languages offered in the settings: [[code, label], …]
  brand: 'object', // { title: plain text for <title>, html: markup for the header logo }
  dateLocale: 'string', // Intl locale for dates (card list, study history)
  level: 'string', // placeholder for a card's level in the card form
  normalize: 'function', // answer text → comparable form
  nearMatch: 'boolean', // wrong case or a word or two off counts as "close", and the diff picks the nearest answer
  ruby: 'boolean', // texts use furigana markup {漢字|かんじ}: answers match by surface or reading,
  //                    the card form previews ruby and warns about kanji without it, and the furigana setting is shown
  romajiInput: 'boolean', // typed romaji is read as hiragana (preview, shown answer, saved answers)
  sentenceClass: 'string', // extra class on prompt sentences ('' for none)
  speech: 'object', // read aloud (js/speech.js): { locale: BCP 47 tag that picks the voice, rate: default speed }
  pitch: 'string', // folder of pitch-accent data drawn over single words (js/pitch.js), '' for none
  registers: 'object', // politeness levels a task can ask for, shown as a label next to the task:
  //                    { plain: '…', polite: '…' } (card.prompt.register), {} for none
  politeAnswer: 'string', // regex source: an answer in the polite register ends like this ('' for none).
  //                    js/cardcheck.js uses it to make sure such cards say which register they want
  topics: 'object', // the decks, see above
};

export const LANGS = {
  de: {
    label: 'Deutsch',
    glyph: 'de',
    tagline: 'auf Deutsch erklärt',
    htmlLang: 'de',
    noteLang: 'de',
    translation: 'aid',
    explainLangs: [['de', 'DE'], ['en', 'EN'], ['zh-Hant', '中文']],
    brand: { title: 'Grammatik Kanpeki', html: '<span lang="de">Grammatik</span> <span class="brand-2" lang="de">Kanpeki</span>' },
    dateLocale: 'de-DE',
    level: 'C1',
    normalize: normalizeDe,
    nearMatch: true,
    ruby: false,
    romajiInput: false,
    sentenceClass: '',
    speech: { locale: 'de-DE', rate: 1 },
    pitch: '',
    registers: {},
    politeAnswer: '',
    topics: [
      {
        id: 'nominalisierung', label: 'Nominalisierung', type: 'rewrite',
        labels: { source: 'Verbalstil', target: 'Nominalstil', placeholder: 'Nominalstil eingeben …' },
        about: 'Rewrite a C1 sentence in Verbalstil (with a clause: wenn, weil, nachdem, obwohl, damit, indem …) into Nominalstil: one clause, the verb turned into a noun phrase (bei, wegen, nach, trotz, zur, durch …). accepted holds the most natural Nominalstil; acceptable holds correct but clumsier versions, e.g. with an unneeded article; mistakes holds typical wrong prepositions or case endings.',
      },
      {
        // \u00AD: soft hyphen, so the long word breaks well in the narrow sidebar.
        id: 'partizipialkonstruktionen', label: 'Partizipial\u00ADkonstruktionen', type: 'rewrite',
        labels: { source: 'Ausgangssatz', target: 'Umformung', placeholder: 'Umgeformten Satz eingeben …' },
        about: 'Rewrite a C1 sentence with a relative clause into one with an extended participle attribute, or the other way round, as the task says. Example: "Die Maßnahmen, die im letzten Jahr beschlossen wurden, …" → "Die im letzten Jahr beschlossenen Maßnahmen …". Mistakes are typically wrong participle endings or Partizip I/II mixed up.',
      },
      {
        id: 'deklination', label: 'Deklination', type: 'cloze', labels: { placeholder: 'Fehlende Form eingeben …' },
        about: 'Fill in one declined form (article, adjective ending, noun or pronoun) in a German sentence. The task names what to fill in, e.g. "Dativ Plural"; base can give the word in its dictionary form.',
      },
      {
        id: 'n-deklination', label: 'n-Deklination', parent: 'deklination',
        about: 'Fill in a masculine noun of the n-Deklination (der Kollege, der Student, der Name, das Herz …) in the right case, e.g. "Ich habe mit dem ___ gesprochen." → Kollegen. base gives the noun in the nominative.',
      },
      {
        id: 'verben-mit-praepositionen', label: 'Verben mit Präpositionen', type: 'cloze',
        labels: { placeholder: 'Präposition (und Artikel) eingeben …' },
        about: 'Fill in the preposition a verb, adjective or noun takes, with the article in the right case when it is part of the gap, e.g. "Sie interessiert sich ___ Kunst." → für. Accept both a contraction (am, zum) and its long form where both are fine.',
      },
      {
        id: 'vocab', label: 'Meine Wortliste', group: 'vocab', type: 'flip',
        about: 'Word list: one German word or phrase per card in its dictionary form (nouns with article, e.g. "die Bedienungsanleitung"; verbs with the object or preposition that belongs to them, e.g. "einer Sache vorbeugen"). accepted holds its meaning as a short German paraphrase; example is a sentence that uses it.',
      },
    ],
  },
  ja: {
    label: '日本語',
    glyph: 'ja',
    tagline: '用繁體中文說明',
    htmlLang: 'zh-Hant',
    noteLang: 'zh-Hant',
    translation: 'always', // beginner: the Chinese translation is always shown
    explainLangs: [['zh-Hant', '中文'], ['en', 'EN'], ['de', 'DE']],
    brand: { title: 'グラマティック完璧', html: '<span lang="ja">グラマティック</span><span class="brand-2" lang="ja">完璧</span>' },
    dateLocale: 'zh-TW',
    level: 'N5',
    normalize: normalizeJa,
    nearMatch: false,
    ruby: true,
    romajiInput: true,
    sentenceClass: 'ja',
    speech: { locale: 'ja-JP', rate: 0.85 },
    pitch: 'data/pitch/ja',
    // Set only when the blank itself can be plain or polite (食べない／食べません); not on forms that look
    // the same either way (飲んで before ください).
    registers: { plain: '普通形', polite: '禮貌' },
    politeAnswer: '(?:ます|ました|ません|ませんでした|ましょう|です)$',
    topics: [
      {
        id: 'verb-conjugation', label: '動詞變化', type: 'cloze',
        labels: { base: '辭書形', showTask: '顯示要變成哪一種形', placeholder: '輸入動詞變化，例如 たべない／食べない／tabenai' },
        facets: {
          verbClass: {
            godan: '五段動詞（第一類）', 'kami-ichidan': '上一段動詞（第二類）',
            'shimo-ichidan': '下一段動詞（第二類）', irregular: '不規則動詞（第三類）',
          },
        },
        // Label style: a form name (ない形) or, when a fixed ending follows the blank, the pattern in kana
        // (てもいい); then a gloss in （）, with … for the part the sentence supplies. No register in the
        // label: ます・ません・ました forms are polite by name, the rest get prompt.register.
        forms: {
          nai: 'ない形（否定）', masen: 'ません形（否定）',
          nakatta: 'なかった形（過去否定）', masendeshita: 'ませんでした形（過去否定）',
          masu: 'ます形', mashita: 'ました形（過去）', ta: 'た形（過去）',
          te: 'て形（然後…）', 'te-kudasai': 'てください（請…）', naide: 'ないでください（請不要…）',
          'teiru-progressive': 'ている形（正在）', 'teiru-state': 'ている形（狀態）',
          tai: 'たい形（想做）', potential: '可能形（會、能夠）',
          volitional: '意向形（一起…吧）', mashou: 'ましょう形（…吧）',
          nagara: 'ながら（一邊…一邊…）', 'ni-iku': '～に行く（去做…）', tekara: 'てから（做完…之後再…）',
          'te-mo-ii': 'てもいい（可以…嗎）', 'te-wa-ikenai': 'てはいけない（不可以…）',
          'ta-koto-ga-aru': 'たことがある（曾經…過）', tari: 'たり（又…又…，列舉動作）', 'ta-hou-ga-ii': 'たほうがいい（最好…）',
        },
        about: 'Conjugate a JLPT N5 verb into the form the task names (ない形, て形, た形, ます形 …) to fill the blank in a short sentence. When the blank could be filled in either register (食べない／食べません), prompt.register says which one; the other goes into acceptable with a note. base is the dictionary form with its Chinese meaning; meta.verbClass is its class. Typical mistakes: the wrong verb class (食べらない), the wrong て-form sound change (飲みて instead of 飲んで).',
      },
      {
        id: 'adjective-conjugation', label: '形容詞變化', type: 'cloze',
        labels: { base: '辭書形', showTask: '顯示要變成哪一種形', placeholder: '輸入形容詞變化，例如 たかくない／高くない／takakunai' },
        facets: { adjClass: { i: 'い形容詞', na: 'な形容詞' } },
        about: 'Conjugate a JLPT N5 adjective into the form the task names (negative, past, て-form, adverb …) to fill the blank. When the blank could be filled in either register (高くない／高くないです), prompt.register says which one. base is the dictionary form; meta.adjClass is "i" or "na". Typical mistakes: treating a な-adjective like an い-adjective (きれくない), いい → いくない instead of よくない.',
      },
      {
        id: 'particles', label: '助詞', type: 'cloze', labels: { placeholder: '輸入助詞，例如 で／de' },
        about: 'Fill in one particle (は, が, を, に, で, へ, と, も, から, まで …) in a JLPT N5 sentence. If two particles are both right, put both in accepted, or the less natural one in acceptable with a note. Notes explain the difference in Traditional Chinese.',
      },
      {
        id: 'counters', label: '數字・助數詞', type: 'cloze', labels: { placeholder: '輸入讀音，例如 さんぼん／sanbon' },
        about: 'Fill in a number with its counter (本, 枚, 匹, 人, つ, 回 …) with the correct reading, e.g. {三本|さんぼん}. Mistakes are the regular-looking readings that are wrong (さんほん, いちほん).',
      },
      {
        id: 'vocab', label: '我的單字本', group: 'vocab', type: 'flip',
        about: 'Word list: one Japanese word per card in its dictionary form with furigana, e.g. {食|た}べる. accepted holds its meaning in Traditional Chinese; example is a JLPT N5 sentence that uses it, with exampleTranslation in Traditional Chinese.',
      },
    ],
  },
};

export const LANG_IDS = Object.keys(LANGS);

/** The topic config, or null. */
export function topicOf(lang, id) {
  return LANGS[lang]?.topics.find((x) => x.id === id) || null;
}

/** The topic and its ancestors, nearest first. */
export function ancestry(lang, id) {
  const out = [];
  const seen = new Set();
  for (let tp = topicOf(lang, id); tp && !seen.has(tp.id); tp = tp.parent ? topicOf(lang, tp.parent) : null) {
    seen.add(tp.id);
    out.push(tp);
  }
  return out;
}

export const childrenOf = (lang, id) => (LANGS[lang]?.topics || []).filter((x) => (x.parent || null) === (id || null));

/** Ids of the topic and all its sub-topics. */
export function deckIds(lang, id) {
  const out = [id];
  for (const c of childrenOf(lang, id)) out.push(...deckIds(lang, c.id));
  return out;
}

/** A setting that sub-topics inherit: the nearest topic (self first) that sets it. */
export function inherited(lang, id, field) {
  for (const tp of ancestry(lang, id)) if (tp[field] !== undefined) return tp[field];
  return undefined;
}

export const groupOf = (lang, id) => inherited(lang, id, 'group') || 'grammar';
export const topicType = (lang, id) => inherited(lang, id, 'type') || null;

/** Labels and facets merged down the tree (the topic's own values win). */
export function labelsOf(lang, id) {
  return Object.assign({}, ...ancestry(lang, id).reverse().map((tp) => tp.labels || {}));
}
export function facetsOf(lang, id) {
  return Object.assign({}, ...ancestry(lang, id).reverse().map((tp) => tp.facets || {}));
}

/** The topic's registry of task labels, merged down the tree: { form id: label } (empty when it has none). */
export function formsOf(lang, id) {
  return Object.assign({}, ...ancestry(lang, id).reverse().map((tp) => tp.forms || {}));
}

/** How a card is drawn and checked: its own `type`, else its topic's. */
export const typeOf = (card) => card?.type || topicType(card?.language, card?.topic);

/** Courses whose texts use furigana markup {漢字|かんじ}. */
export const usesRuby = (lang) => !!LANGS[lang]?.ruby;

/** The language's word-list topic (a flip deck with id "vocab"), if it has one. */
export const vocabTopic = (lang) => topicOf(lang, 'vocab');
