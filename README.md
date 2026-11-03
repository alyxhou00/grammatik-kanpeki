# Grammatik Kanpeki

An Anki-style grammar trainer for German and Japanese that runs in the browser.

- **Deutsch → Nominalisierung** (C1): you see a sentence in Verbalstil and type the Nominalstil.
- **日本語 → 動詞變化** (N5, explained in Traditional Chinese): you see the dictionary form (with furigana), the target form, a Japanese sentence with a blank, and its full Chinese translation. You type the conjugated verb in kana, kanji, or romaji.

Answers are checked automatically against three lists: **correct**, **correct but not ideal** (with a note on why), and **typical mistakes** (with targeted feedback). After checking, you grade yourself (Again / Hard / Good / Easy, or keys 1–4), and a simple SM-2 scheduler decides when the card comes back. If your answer is right but not in the list yet, you can save it as a new accepted or "not ideal" answer.

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
  "version": 1,
  "cards": [
    {
      "id": "de-nom-demo-001",          // unique, stable; import merges by id
      "language": "de",                 // "de" | "ja"
      "topic": "nominalisierung",       // "nominalisierung" | "verb-conjugation"
      "source": "demo",                 // where the card came from
      "level": "C1",
      "tags": ["konditional", "bei"],
      "prompt": {                       // shown on screen (fields depend on the topic)
        "verbalstil": "Wenn man die Maschine falsch bedient, kann sie beschädigt werden.",
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

Japanese cards use `prompt.verb`, `prompt.meaning`, `prompt.formLabel`, `prompt.sentence` (with `___` as the blank) and `prompt.translation["zh-Hant"]`, plus `meta.verbClass` (`godan`, `kami-ichidan`, `shimo-ichidan`, `irregular`) and `meta.form`.

**Furigana markup:** `{漢字|かんじ}`, for example `{食|た}べる`. The same string gives the ruby display, the kanji spelling, and the kana reading, so an answer typed as either `食べない` or `たべない` (or `tabenai`) counts.

## Code layout

| File | Role |
| --- | --- |
| `js/app.js` | Routing, views, events |
| `js/topics.js` | Languages, topics, and how each topic's card is drawn |
| `js/check.js` | Answer normalization, matching, word diff |
| `js/srs.js` | Scheduler |
| `js/store.js` | Card library, import/export, localStorage |
| `js/text.js` | Escaping, furigana, romaji → hiragana |
| `js/i18n.js` | UI strings (German page in German, Japanese page in Traditional Chinese) |

To add a topic, add it to `LANGS` and `RENDERERS` in `js/topics.js`, then add a data file to `data/manifest.json`.
