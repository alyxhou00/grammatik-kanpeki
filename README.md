# Grammatik Kanpeki

An Anki-style grammar trainer for German and Japanese that runs in the browser.

- **Deutsch → Nominalisierung** (C1): you see a sentence in Verbalstil and type the Nominalstil.
- **日本語 → 動詞變化** (N5, explained in Traditional Chinese): you see the dictionary form (with furigana), the target form, a Japanese sentence with a blank, and its full Chinese translation. You type the conjugated verb in kana, kanji, or romaji.
- **Word list (Deutsch → Meine Wortliste, 日本語 → 我的單字本)**: in a sentence, hover a word (tap on a phone) to see its meaning (and its reading, for Japanese) and save it to your word list. The word list is its own deck of classic flip cards: see the word, recall the meaning, then grade yourself. German words are saved in their dictionary form, nouns with their article (`die Bedienungsanleitung`), and explained in German.

Topics that are set up but have no cards yet: Partizipialkonstruktionen, Deklination (with the sub-topic n-Deklination), Verben mit Präpositionen, 形容詞變化, 助詞, 數字・助數詞.

Topics can have sub-topics. As in Anki, a parent deck studies its own cards and those of all its sub-topics, and its daily limits also cap the sub-topics.

The language menu is at the top; light, dark, or system theme is in the settings.

## Adding your own cards

As in Anki, **Karte hinzufügen / 新增卡片** (next to Learn / Cards) opens a form for a new card in the current topic. The form follows the topic's card type: a sentence to rewrite, a sentence with a `___` blank, or a word for a flip card. Only the main text and at least one correct answer are required. Everything else is optional: a list of "correct but not ideal" answers and typical mistakes (each with a note), translations, a hint, the task chip, an explanation, the topic's facets (such as the verb class), level, tags, and source. After **Add** (or Ctrl+Enter) the form stays open for the next card and keeps the topic, tags, level, and source.

The pencil icon in the card list, or **Bearbeiten / 編輯** while studying, opens the same form for an existing card. Fields the form does not show, such as `prompt.words`, are kept. Edited bundled cards are saved to `localStorage` like imported ones.

For Japanese, write furigana as `{漢字|かんじ}`. The form shows a preview, and it warns when kanji have no furigana, because then a kana answer is not recognized. Answers typed in romaji are saved as hiragana. The form also warns when a card with the same sentence already exists.

Answers are checked automatically against three lists: **correct**, **correct but not ideal** (with a note on why), and **typical mistakes** (with targeted feedback). After checking, you grade yourself (Again / Hard / Good / Easy, or keys 1–4). If your answer is right but not in the list yet, you can save it as a new accepted or "not ideal" answer.

## Scheduling

`js/srs.js` is a port of Anki's default scheduler (SM-2 based, with FSRS off), using Anki's default deck options:

| Option | Value |
| --- | --- |
| Learning steps | 1m 10m |
| Graduating interval / Easy interval | 1 day / 4 days |
| Relearning steps | 10m |
| Starting ease, Easy bonus, Hard interval | 2.50, 1.30, 1.20 |
| New interval after a lapse, minimum interval | 0.00, 1 day |
| Leech threshold | 8 lapses (the card is tagged, not suspended) |
| New cards / max reviews per day | 20 / 200 (changeable in settings) |
| Next day starts at, learn ahead limit | 4 AM, 20 minutes |

Fuzz, late-review bonus, early reviews and the "at least one day longer" rules work as in Anki. Not ported: FSRS, the load balancer (it only picks which day inside the fuzz range), "easy days", and multi-day learning steps. "Alle üben / 全部練習" is a practice mode that does not change the schedule.

Run the scheduler tests with:

```bash
node tests/srs.test.mjs
```

The add / edit card form has its own tests (`node tests/cardform.test.mjs`). Among other things, every bundled card must come back unchanged after an edit that changes nothing.

## Run it

It is a static site with no build step. It needs a local web server, because browsers block `fetch()` for pages opened straight from `file://`:

```bash
python -m http.server 8123
```

Then open <http://localhost:8123>.

## Where data lives

| What | Where |
| --- | --- |
| Bundled cards | `data/**.json`, listed in `data/manifest.json` |
| Imported or edited cards | browser `localStorage` (they override bundled cards with the same `id`) |
| Review progress, settings | browser `localStorage` |

**Import / Export** (top right) downloads or loads JSON in the same format as the bundled files. The export can include review progress. On import, cards are merged by `id`: you can choose to overwrite existing cards or add only new ones.

## Card format

The full JSON Schema is in [`schema/cards.schema.json`](schema/cards.schema.json).

```jsonc
{
  "format": "grammatik-kanpeki.cards",
  "version": 2,
  "cards": [
    {
      "id": "de-nom-demo-001",          // unique, stable; import merges by id
      "language": "de",                 // "de" | "ja"
      "topic": "nominalisierung",       // a topic id from js/topics.js (the most specific one)
      "source": "demo",                 // where the card came from
      "level": "C1",
      "tags": ["konditional", "bei"],
      "prompt": {                       // shown on screen (fields depend on the card type)
        "source": "Wenn man die Maschine falsch bedient, kann sie beschädigt werden.",
        "hint": "wenn (Bedingung) → bei + Dativ",
        "translation": { "en": "…", "zh-Hant": "…" }
      },
      "answer": {                       // what you type
        "accepted":   ["Bei falscher Bedienung kann die Maschine beschädigt werden."],
        "acceptable": [{ "text": "Bei einer falschen Bedienung …", "note": "Correct, but …" }],
        "mistakes":   [{ "text": "…", "note": "…" }]
      },
      "explanation": { "de": "…", "en": "…", "zh-Hant": "…" }
    }
  ]
}
```

### Card types

Each topic draws its cards with one of three card types (set in `js/topics.js`, inherited by sub-topics; a card can override it with `"type"`):

| Type | What you do | Required prompt field | Used by |
| --- | --- | --- | --- |
| `rewrite` | Rewrite the whole sentence | `source` | Nominalisierung, Partizipialkonstruktionen |
| `cloze` | Fill the blank `___` in the sentence | `sentence` (optional `base: { word, meaning, pos }`) | 動詞變化, 形容詞變化, 助詞, 數字・助數詞, Deklination, Verben mit Präpositionen |
| `flip` | See the front, recall the back, grade yourself | `word` (optional `pos`, `example`, `exampleTranslation`) | Meine Wortliste, 我的單字本 |

Fields every type understands:

- `prompt.translation`: Japanese shows the Chinese translation right away; German hides each translation behind a click.
- `prompt.hint`: a tip, hidden until clicked.
- `prompt.task`: the target as a chip, for example `ない形（否定）`.
- `prompt.words`: hoverable words.
- `explanation`: shown after answering, with a tab for each language the card has.
- `meta`: values that the topic names in its `facets` show as chips. One example is `verbClass` (`godan`, `kami-ichidan`, `shimo-ichidan`, `irregular`).

`prompt.words` lists the hoverable words of the card's sentence, in order (rewrite: `source`, cloze: `sentence`, flip: `example`):

```json
{ "text": "{歩|ある}いた", "lemma": "{歩|ある}く", "meaning": "走路", "pos": "動詞" }
```

`text` is the word exactly as written in the sentence. `lemma` is the dictionary form that gets saved (leave it out when it equals `text`). In German sentences, a word is not matched inside a longer word. Saved words become cards with `"topic": "vocab"`, so they are exported and imported like any other card. A saved card is one *sense* of a word: its dictionary form plus the meaning given in the sentence it came from. So `die Bank` "bench" and `die Bank` "bank" are two cards, and their front shows the example sentence so you can tell them apart. The card stores that sense in `meta.sense` (`"die Bank|Geldinstitut"`), and its id is built from it (`de-vocab-die Bank-<hash>`), so the same sense saved on two devices merges on import. A word card with no `meta.sense` (saved before senses existed, or added by hand) counts as saved when its word and one of its meanings match. Words can only be saved in a course that has a `vocab` topic. In the others, hovering shows the meaning only.

**Version 1 files** (from before card types existed) still import. They are upgraded on load: `verbalstil` becomes `source`, `verb` and `meaning` become `base`, and `formLabel` becomes `task`.

Check the bundled data with `node tests/data.test.mjs`: it makes sure every word is found in its sentence, every kanji has furigana, every facet value is one the topic knows, and every answer list is judged as intended.

**Furigana markup:** `{漢字|かんじ}`, for example `{食|た}べる`. The same string gives the ruby display, the kanji spelling, and the kana reading, so an answer typed as either `食べない` or `たべない` (or `tabenai`) counts.

## Writing cards with an LLM (or by hand)

For new cards, write an **authoring file** instead of the full format. It names the course and topic once and holds only what an author decides: no ids, dates, course or topic on each card, and only the fields the topic's card type uses.

```jsonc
{
  "format": "grammatik-kanpeki.authoring",
  "language": "ja", "topic": "particles",
  "source": "Claude, 2026-11",                  // optional
  "cards": [
    {
      "prompt": { "sentence": "{図書館|としょかん}___{本|ほん}を{読|よ}みます。", "translation": { "zh-Hant": "在圖書館看書。" } },
      "answer": { "accepted": ["で"], "mistakes": [{ "text": "に", "note": "做動作的地點要用で。" }] },
      "level": "N5"
    }
  ]
}
```

Each topic has its own JSON Schema for this, built from the topic's entry in `js/topics.js`. A new topic gets one without further work.

```bash
node tools/schema.mjs
```

lists the courses and topics.

```bash
node tools/schema.mjs ja particles --prompt --count 10
```

prints a prompt to paste into an LLM: the topic's brief (`about`), the rules, an existing card as an example, the sentences that already have cards, and the schema. `node tools/schema.mjs ja particles` prints the schema alone.

```bash
node tools/validate.mjs new-cards.json --out import.json
```

checks the answer against the schema and the same rules as the data tests (answer lists, hoverable words, facet values, furigana). It prints one line per problem with where it is, for example `✗ cards[4] "駅から家___歩いて十分です。": prompt.sentence: every kanji needs its reading …`, so you can paste the lines back to the LLM to fix. With `--out` it writes an importable card file once everything passes. It also checks exported card files.

**Import / Export** in the app also takes authoring files directly. Cards that don't fit the schema are counted as invalid and left out. Generated cards get an id from their sentence and first answer, so importing the same file again updates the cards instead of doubling them.

A validator can't tell a wrong reading ({生|せい} where {生|なま} is meant) or a weak model answer, so look over generated cards before you rely on them. The pencil icon in the card list opens them in the edit form.

## Code layout

| File | Role |
| --- | --- |
| `js/app.js` | Routing, views, events |
| `js/topics.js` | Languages and the topic tree (pure data + helpers) |
| `js/cardtypes.js` | Card types: how `rewrite`, `cloze` and `flip` cards are drawn |
| `js/check.js` | Answer normalization, matching, word diff |
| `js/srs.js` | Scheduler (port of Anki's SM-2 defaults) |
| `js/store.js` | Card library, import/export, localStorage |
| `js/cardform.js` | Add / edit card form: form values ↔ card (no DOM) |
| `js/text.js` | Escaping, furigana, romaji → hiragana |
| `js/i18n.js` | UI strings (German page in German, Japanese page in Traditional Chinese) |
| `js/cardcheck.js` | Content checks for one card (answer lists, words, facets, furigana), shared by tests and tools (no DOM) |
| `js/authoring.js` | Authoring format: per-topic schema, schema check, authoring ↔ full cards (no DOM) |
| `tools/schema.mjs`, `tools/validate.mjs` | Command-line: print a topic's schema or LLM prompt; check a card file |

To add a topic, add an entry to its language in `LANGS` in `js/topics.js`: `id`, `label`, a `type` or a `parent`, an `about` brief (what the exercise is and what makes a good card, in English), and optional `labels` and `facets`. The sidebar, the card form, the authoring schema, the LLM prompt and the validator all follow from that entry. Cards can then come from the form, an authoring file, or a data file listed in `data/manifest.json`. A topic with a new kind of exercise gets a new card type in `js/cardtypes.js` (and its prompt fields in `js/authoring.js`).

Tests: `node tests/data.test.mjs`, `node tests/cardform.test.mjs`, `node tests/authoring.test.mjs`, `node tests/srs.test.mjs`.
