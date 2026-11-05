# Grammatik Kanpeki

An Anki-style grammar trainer for German and Japanese that runs in the browser.

> **A personal trainer, for now.** The site only works as a tool for one person on one browser. There are no accounts, no sync between devices, no shared decks, and no server: cards, progress, history and settings live in your browser's `localStorage`. Move them between devices by hand with Import / Export. A backend for sync and premium features may come later as an optional add-on.

## Courses

- **Deutsch → Nominalisierung** (C1): rewrite a Verbalstil sentence in Nominalstil.
- **日本語 → 動詞變化** (N5, explained in Traditional Chinese): fill the blank with the conjugated verb (kana, kanji, or romaji).
- **日本語 → 數字・助數詞** (N5): fill in the reading of a number or of a number with its counter (つ, 人, 歳, 年生, 本, 匹, 時, 分, 日, 月, 円 …), with the sound changes and irregular readings.
- **Word list** (Meine Wortliste / 我的單字本): hover a word in a sentence to see its meaning and save it; the list is a deck of flip cards.
- **Sentences** (Meine Beispielsätze / 我的例句本): whole sentences to learn. You see the sentence, recall what it means, and grade yourself. Add them with the card form, or many at once with Import (see "Writing many cards with an LLM").

Topics can have sub-topics; a parent deck studies the cards of all its sub-topics. Topics set up but without cards yet: Partizipialkonstruktionen, Deklination, Verben mit Präpositionen, 形容詞變化, 助詞.

## Features

- **Scheduling:** `js/srs.js` ports Anki's default SM-2 scheduler (no FSRS, load balancer, or easy days). Defaults: steps 1m 10m, graduating 1d, easy 4d, ease 2.50, 20 new / 200 reviews per day (changeable), day starts at 4 AM. "Alle üben / 全部練習" practises without changing the schedule.
- **Answer checking:** against lists of correct, "correct but not ideal", and typical-mistake answers (with feedback), then you grade yourself 1–4. A right answer not yet in a list can be saved to it.
- **Add / edit cards:** the form next to Learn / Cards. Japanese furigana is written `{漢字|かんじ}`. A cloze card's base word may write `{漢字|-}` to show a kanji without furigana when its usual reading would mislead, e.g. `1{人|-}` (ひとり, not いちにん).
- **Read aloud:** speaker buttons use the browser's Web Speech API (voice and speed per course in the settings). Buttons stay hidden if the OS has no voice for the course.
- **Pitch accent:** Japanese words get pitch marks from [Kanjium](https://github.com/mifunetoshiro/kanjium) data (CC BY-SA 4.0), converted by `tools/pitch.mjs` into `data/pitch/ja/` (see the README there).
- **Grammar guide:** the third tab (文法說明 / Erklärungen) explains the course's grammar, split by topic. After answering, and in the card list (book icon), a card links to the entry for its form; a back button (or Esc) returns to that card. Chapters fold, and the guide remembers which are folded. 動詞變化 shows every form with タピる (五段) and 食べる (一段) side by side; 數字・助數詞 covers numbers, ～つ, ～人・～歳・～年生, the は行／か行 sound changes and dates; other topics are marked as coming. Content is in `js/grammar.js`: every form in a topic's `forms` registry needs one entry (`node tests/grammar.test.mjs`).
- **Streak and history:** the flame in the top bar opens a streak summary and a 12-month heatmap, counted per day and course.

## Run it

No build step. Serve the folder, because browsers block `fetch()` from `file://`:

```bash
python -m http.server 8123
```

Then open <http://localhost:8123>. To try a git worktree/branch, serve its folder on another port. Each address has its own `localStorage`, so it starts empty: carry your data over with Import / Export (tick "Lernfortschritt mitexportieren / 一併匯出學習進度").

## Where data lives

| What | Where |
| --- | --- |
| Bundled cards | `data/**.json`, listed in `data/manifest.json` |
| Imported or edited cards, progress, history, settings | browser `localStorage` (edited cards override bundled ones with the same `id`) |

**Import / Export** (top right) uses the same JSON as the bundled files and can include progress and study history. Cards merge by `id`; history merges day by day, keeping the larger count.

## Cards

- **Format:** [`schema/cards.schema.json`](schema/cards.schema.json). Each card has `id`, `language`, `topic`, `source` (a code from `js/sources.js`), `level`, `tags`, `prompt`, `answer` (`accepted` / `acceptable` / `mistakes`) and `explanation`.
- **Card types** (set per topic in `js/topics.js`): `rewrite` (rewrite the sentence), `cloze` (fill the `___`), `flip` (recall a word's meaning), `sentence` (recall a sentence's translation, kept in `answer.accepted`).
- **Writing many cards with an LLM:** use the shorter authoring format. `node tools/schema.mjs ja particles --prompt --count 10` prints a prompt to paste into an LLM; `node tools/validate.mjs new-cards.json --out import.json` checks the result and writes an importable file. The app's Import also accepts authoring files directly. Always review generated cards, since a validator can't catch a wrong reading.

## Code layout

| File | Role |
| --- | --- |
| `js/app.js` | Routing, views, events |
| `js/topics.js` | Course settings (`LANGS`) and the topic tree |
| `js/cardtypes.js`, `js/check.js` | Card types; answer matching |
| `js/srs.js`, `js/studylog.js` | Scheduler; study history |
| `js/store.js`, `js/cardform.js` | Card library, import/export, storage; add/edit form |
| `js/text.js`, `js/speech.js`, `js/i18n.js`, `js/sources.js` | Furigana and normalizers; read aloud; UI strings; source names |
| `js/cardcheck.js`, `js/authoring.js` | Content checks; authoring format |
| `js/grammar.js` | Grammar guide content, and which entry explains a card |
| `tools/schema.mjs`, `tools/validate.mjs` | Print a topic's schema or LLM prompt; check a card file |

To add a course or topic, add an entry to `LANGS` in `js/topics.js` (with an `about` brief), its UI strings in `js/i18n.js`, and for a new course its code in the `language` enum of the schema. The sidebar, form, schema, prompt and validator follow from that entry.
