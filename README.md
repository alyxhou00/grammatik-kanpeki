# Grammatik Kanpeki

An Anki-style grammar trainer for German and Japanese that runs in the browser.

- **Deutsch → Nominalisierung** (C1): you see a sentence in Verbalstil and type the Nominalstil.
- **日本語 → 動詞變化** (N5, explained in Traditional Chinese): you see the dictionary form (with furigana), the target form, a Japanese sentence with a blank, and its full Chinese translation. You type the conjugated verb in kana, kanji, or romaji.
- **日本語 → 我的單字本**: in a sentence, hover a word (tap on a phone) to see its reading and meaning and save it to your word list. The word list is its own deck of classic flip cards: see the word, recall the meaning, then grade yourself.

Topics that are set up but have no cards yet: Partizipialkonstruktionen, Deklination (with the sub-topic n-Deklination), Verben mit Präpositionen, 形容詞變化, 助詞, 數字・助數詞.

Topics can have sub-topics. As in Anki, a parent deck studies its own cards and those of all its sub-topics, and its daily limits also cap the sub-topics.

The language menu is at the top; light, dark, or system theme is in the settings.

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
| `flip` | See the front, recall the back, grade yourself | `word` (optional `pos`, `example`, `exampleTranslation`) | 我的單字本 |

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

`text` is the word exactly as written in the sentence. `lemma` is the dictionary form that gets saved (leave it out when it equals `text`). In German sentences, a word is not matched inside a longer word. Saved words become cards with `"topic": "vocab"`, so they are exported and imported like any other card. Words can only be saved in a course that has a `vocab` topic. In the others, hovering shows the meaning only.

**Version 1 files** (from before card types existed) still import. They are upgraded on load: `verbalstil` becomes `source`, `verb` and `meaning` become `base`, and `formLabel` becomes `task`.

Check the bundled data with `node tests/data.test.mjs`: it makes sure every word is found in its sentence, every kanji has furigana, and every answer list is judged as intended.

**Furigana markup:** `{漢字|かんじ}`, for example `{食|た}べる`. The same string gives the ruby display, the kanji spelling, and the kana reading, so an answer typed as either `食べない` or `たべない` (or `tabenai`) counts.

## Code layout

| File | Role |
| --- | --- |
| `js/app.js` | Routing, views, events |
| `js/topics.js` | Languages and the topic tree (pure data + helpers) |
| `js/cardtypes.js` | Card types: how `rewrite`, `cloze` and `flip` cards are drawn |
| `js/check.js` | Answer normalization, matching, word diff |
| `js/srs.js` | Scheduler (port of Anki's SM-2 defaults) |
| `js/store.js` | Card library, import/export, localStorage |
| `js/text.js` | Escaping, furigana, romaji → hiragana |
| `js/i18n.js` | UI strings (German page in German, Japanese page in Traditional Chinese) |

To add a topic, add a line to its language in `LANGS` in `js/topics.js` (`id`, `label`, a `type` or a `parent`, optional `labels` and `facets`), then add a data file to `data/manifest.json`. A topic with a new kind of exercise gets a new card type in `js/cardtypes.js`.
