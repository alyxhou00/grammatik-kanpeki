// Languages and topics. Pure data plus tree helpers: no DOM, so tests and the store can import it.
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
//
// A course reads its sentences aloud when it sets `speech`: { locale (BCP 47, picks the voice), rate
// (default speed; beginners get a slower one) }. See js/speech.js.

export const CARD_TYPES = ['rewrite', 'cloze', 'flip'];

export const LANGS = {
  de: {
    label: 'Deutsch',
    glyph: 'de',
    tagline: 'auf Deutsch erklärt',
    htmlLang: 'de',
    noteLang: 'de', // language of answer notes
    translation: 'aid', // translations are hidden behind a click
    explainLangs: [['de', 'DE'], ['en', 'EN'], ['zh-Hant', '中文']],
    speech: { locale: 'de-DE', rate: 1 },
    topics: [
      {
        id: 'nominalisierung', label: 'Nominalisierung', type: 'rewrite',
        labels: { source: 'Verbalstil', target: 'Nominalstil', placeholder: 'Nominalstil eingeben …' },
      },
      {
        // \u00AD: soft hyphen, so the long word breaks well in the narrow sidebar.
        id: 'partizipialkonstruktionen', label: 'Partizipial\u00ADkonstruktionen', type: 'rewrite',
        labels: { source: 'Ausgangssatz', target: 'Umformung', placeholder: 'Umgeformten Satz eingeben …' },
      },
      { id: 'deklination', label: 'Deklination', type: 'cloze', labels: { placeholder: 'Fehlende Form eingeben …' } },
      { id: 'n-deklination', label: 'n-Deklination', parent: 'deklination' },
      {
        id: 'verben-mit-praepositionen', label: 'Verben mit Präpositionen', type: 'cloze',
        labels: { placeholder: 'Präposition (und Artikel) eingeben …' },
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
    speech: { locale: 'ja-JP', rate: 0.85 },
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
      },
      {
        id: 'adjective-conjugation', label: '形容詞變化', type: 'cloze',
        labels: { base: '辭書形', showTask: '顯示要變成哪一種形', placeholder: '輸入形容詞變化，例如 たかくない／高くない／takakunai' },
        facets: { adjClass: { i: 'い形容詞', na: 'な形容詞' } },
      },
      { id: 'particles', label: '助詞', type: 'cloze', labels: { placeholder: '輸入助詞，例如 で／de' } },
      { id: 'counters', label: '數字・助數詞', type: 'cloze', labels: { placeholder: '輸入讀音，例如 さんぼん／sanbon' } },
      { id: 'vocab', label: '我的單字本', group: 'vocab', type: 'flip' },
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

/** How a card is drawn and checked: its own `type`, else its topic's. */
export const typeOf = (card) => card?.type || topicType(card?.language, card?.topic);

/** The language's word-list topic (a flip deck with id "vocab"), if it has one. */
export const vocabTopic = (lang) => topicOf(lang, 'vocab');
