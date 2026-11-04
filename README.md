# Grammatik Kanpeki

An Anki-style grammar trainer for German and Japanese that runs in the browser.

- **Deutsch → Nominalisierung** (C1): you see a sentence in Verbalstil and type the Nominalstil.
- **日本語 → 動詞變化** (N5, explained in Traditional Chinese): you see the dictionary form (with furigana), the target form, a Japanese sentence with a blank, and its full Chinese translation. You type the conjugated verb in kana, kanji, or romaji.
- **Word list (Deutsch → Meine Wortliste, 日本語 → 我的單字本)**: in a sentence, hover a word (tap on a phone) to see its meaning (and its reading, for Japanese) and save it to your word list. The word list is its own deck of classic flip cards: see the word, recall the meaning, then grade yourself. German words are saved in their dictionary form, nouns with their article (`die Bedienungsanleitung`), and explained in German.

Topics that are set up but have no cards yet: Partizipialkonstruktionen, Deklination (with the sub-topic n-Deklination), Verben mit Präpositionen, 形容詞變化, 助詞, 數字・助數詞.

Topics can have sub-topics. As in Anki, a parent deck studies its own cards and those of all its sub-topics, and its daily limits also cap the sub-topics.

The language menu is at the top; light, dark, or system theme is in the settings.

## Read aloud

A speaker button next to a sentence or word reads it aloud, so you can hear the intonation (for Japanese, the pitch accent). It uses the browser's built-in speech (Web Speech API): no server and no account.

- **Where:** the sentence and the model answer (Nominalisierung), the dictionary form, the sentence and the model answer (cloze cards: before you answer, the blank is read as a short pause, so the answer is not given away; after you answer, the sentence is read with the answer filled in), the word after flipping and its example (word list), and the word popup. **R** plays the card's sentence after answering.
- **Settings → Vorlesen / 朗讀:** voice and speed per course. Japanese starts a bit slower (0.85×) than German (1×). "Automatic" picks the most natural voice it finds.
- Furigana is read as written in kanji, not as kana, because the engine needs the word to pick its pitch accent (箸 and 橋 are both はし but sound different). The engine can still misread a kanji now and then; the furigana on screen is the reference.
- **Voices depend on the browser and OS.** Edge has natural online voices (Nanami, Keita, Katja, Conrad), Chrome has "Google 日本語" and "Google Deutsch". Firefox and other Chromium-based apps only use the voices installed in the OS: on Windows, add Japanese or German under Settings → Time & language → Language & region → (language) → Speech. Without a voice for the course, the buttons stay hidden and the settings say why.

A new course sets its voice with `speech: { locale, rate }` in `js/topics.js` (for example `{ locale: 'fr-FR', rate: 1 }`).

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

The add / edit card form has its own tests (`node tests/cardform.test.mjs`), and so does read-aloud (`node tests/speech.test.mjs`). Among other things, every bundled card must come back unchanged after an edit that changes nothing.

## Streak and study history

Every graded answer, in **Lernen / 學習** and in **Alle üben / 全部練習**, is counted for its study day (days start at 4 AM, as in the scheduler). The flame in the top bar shows the streak: the number of days in a row with at least one answer. It is grey until you have studied today; the streak only breaks after a whole day without studying.

Clicking the flame opens **Lernverlauf / 學習紀錄**: current and longest streak, days studied, today's cards, and a GitHub-style heatmap of the last 12 months for both languages. Hover or tap a day to see its count per language. Weeks start on Monday on the German page and on Sunday on the Chinese one.

The log keeps counts per day and language (`js/studylog.js`), not every single answer, so a year of history is only a few kilobytes. Check it with `node tests/studylog.test.mjs`.

## Run it

The app works without a backend: it is a static site with no build step, and all your data stays in the browser. A backend for sync and premium features may come later as an optional add-on (see [`docs/reviews/2026-11-05-backend-optional-review.md`](docs/reviews/2026-11-05-backend-optional-review.md)).

To run it locally you still need a simple web server, because browsers block `fetch()` for pages opened straight from `file://`:

```bash
python -m http.server 8123
```

Then open <http://localhost:8123>.

### Trying a branch before it is merged

Work in progress often lives in its own git worktree, a separate folder with one branch checked out (Claude Code puts them in `.claude/worktrees/<name>`). Because the app has no build step, you can try a branch by serving its folder. You don't need to merge it first. List the worktrees and their folders:

```bash
git worktree list
```

Serve the one you want on a port of its own, so it can run next to `main` on 8123:

```bash
cd D:/Code/GrammatikKanpeki/.claude/worktrees/<name>
```

```bash
python -m http.server 8130
```

Then open <http://localhost:8130> in any browser. Use a different port for each worktree you run at the same time.

**Your cards and progress are not there.** The browser keeps `localStorage` separately for each address, so `localhost:8130` starts empty, apart from the bundled cards. To try a branch with your own data, use **Import / Export** on `localhost:8123`: export all cards with "Lernfortschritt mitexportieren / 一併匯出學習進度" ticked, then import that file on the branch's port. What you do there doesn't change your data on 8123.

## Where data lives

| What | Where |
| --- | --- |
| Bundled cards | `data/**.json`, listed in `data/manifest.json` |
| Imported or edited cards | browser `localStorage` (they override bundled cards with the same `id`) |
| Review progress, study history, settings | browser `localStorage` |

**Import / Export** (top right) downloads or loads JSON in the same format as the bundled files. The export can include review progress and the study history (`studyLog`; for one course, only that course's days). On import, the study history is merged day by day, keeping the larger count, so importing the same file twice changes nothing. On import, cards are merged by `id`: you can choose to overwrite existing cards or add only new ones.

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

`text` is the word exactly as written in the sentence. `lemma` is the dictionary form that gets saved (leave it out when it equals `text`). In German sentences, a word is not matched inside a longer word. Saved words become cards with `"topic": "vocab"`, so they are exported and imported like any other card. Words can only be saved in a course that has a `vocab` topic. In the others, hovering shows the meaning only.

**Version 1 files** (from before card types existed) still import. They are upgraded on load: `verbalstil` becomes `source`, `verb` and `meaning` become `base`, and `formLabel` becomes `task`.

Check the bundled data with `node tests/data.test.mjs`: it makes sure every word is found in its sentence, every kanji has furigana, and every answer list is judged as intended.

**Furigana markup:** `{漢字|かんじ}`, for example `{食|た}べる`. The same string gives the ruby display, the kanji spelling, and the kana reading, so an answer typed as either `食べない` or `たべない` (or `tabenai`) counts.

## Code layout

| File | Role |
| --- | --- |
| `js/app.js` | Routing, views, events |
| `js/topics.js` | Course settings (`LANGS`) and the topic tree (no DOM) |
| `js/cardtypes.js` | Card types: how `rewrite`, `cloze` and `flip` cards are drawn |
| `js/check.js` | Answer matching and word diff (uses the course's normalizer) |
| `js/srs.js` | Scheduler (port of Anki's SM-2 defaults) |
| `js/store.js` | Card library, import/export, localStorage |
| `js/studylog.js` | Study history per day: streak, heatmap, merging (no DOM, no storage) |
| `js/cardform.js` | Add / edit card form: form values ↔ card (no DOM) |
| `js/text.js` | Escaping, furigana, romaji → hiragana, answer normalizers |
| `js/speech.js` | Read aloud: voice choice and playback through the Web Speech API |
| `js/i18n.js` | UI strings (German page in German, Japanese page in Traditional Chinese) |

To add a topic, add a line to its language in `LANGS` in `js/topics.js` (`id`, `label`, a `type` or a `parent`, optional `labels` and `facets`), then add a data file to `data/manifest.json`. A topic with a new kind of exercise gets a new card type in `js/cardtypes.js`.

Everything that differs between courses is a field of `LANGS[lang]` (listed in `LANG_FIELDS`): how answers are normalized, whether near misses count as "close", romaji input, furigana, the read-aloud voice, the brand, the date locale and so on. The code reads these fields and never asks which language it is, so a new course is a new `LANGS` entry, its UI strings in `js/i18n.js` and its code in the `language` enum of `schema/cards.schema.json`; `tests/data.test.mjs` checks that every course sets every field and has the same UI strings.
