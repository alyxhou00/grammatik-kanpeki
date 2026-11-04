# Grammatik Kanpeki: rollout review

- **Date:** 2026-11-04
- **Code reviewed:** commit `d4d4a49` ("Show lowercase ISO 639-1 codes in language badges")
- **Question:** what is missing, and what is inconsistent, to roll the app out to friends and other real users, with content that fits each learner's level, user-created cards, and support for other grammars.

This is a snapshot. The app will change, so check each point against the current code before acting on it.

The prototype isn't ready for other users yet, but the foundations are solid: the SRS port is careful, card types are separate from topics, HTML is escaped consistently, and there are data tests. The blocker is that the app assumes **one learner, two courses (de, ja), one UI language per course, and content written by the owner**. Those assumptions live in JavaScript, not in data, so a new user, language or grammar point means a code change.

## Inconsistencies that block extensibility

Nine issues; the first five matter most.

| # | Issue | Where | Impact |
| --- | --- | --- | --- |
| 1 | Languages and topic tree are hard-coded; the schema's language enum is `de`/`ja` | `js/topics.js`, `schema/cards.schema.json` | Users can't create topics; cards with an unknown topic are rejected on import |
| 2 | Answer checking branches on `de`/`ja`; any other language falls back to the German normalizer | `js/check.js`, `js/cardtypes.js`, `js/app.js` | French, Spanish, Korean etc. are checked wrongly; romaji input is wired to `ja` only |
| 3 | UI language is tied to the course (German UI for German, Chinese UI for Japanese); topic labels, brand, date locale also follow it | `js/i18n.js`, `js/app.js`, `index.html` | An English speaker learning Japanese gets a Chinese UI. UI locale, target language and explanation language need to be separate |
| 4 | "Save my answer" copies the whole bundled card into user storage, which then overrides it forever | `js/store.js` (`addAlternative`) | Fixes to bundled cards never reach that user; store edits as overlays instead |
| 5 | `card.level` is stored but never read; new cards come in file order | `js/app.js` (`startSession`) | No basis yet for level-fit content; CEFR and JLPT scales aren't mapped |
| 6 | Help level (translation always shown vs. hidden) is a course setting | `js/topics.js` | Assumes the owner's level in each language |
| 7 | `vocab` is a magic topic id; word ids are `lang-vocab-<surface>` | `js/cardtypes.js`, `js/app.js` | Homographs collide (Bank/Bank, 方); one word list per language |
| 8 | Storage write failures only log to the console; everything sits in one localStorage key (~5 MB) | `js/store.js` (`write`) | Large uploads can silently lose data |
| 9 | All bundled files load at startup, one after another | `js/store.js` (`loadBundled`) | Slow once real content exists; load per language or deck |

## Level-fit content

Nothing personalizes content by level today.

- **Learner level per course**, from self-assessment or a short placement quiz, stored in a profile.
- **Topics as data** with `level`, `prerequisites`, a short grammar note and an order, so the app can recommend or unlock the next topic.
- **New cards ordered by level**, optionally filtered to the learner's level ± 1.
- **Adaptive help**: translations, hints and furigana fade as a topic matures.
- **Weak-spot hints** from lapse and leech stats per tag or facet (e.g. godan ない-forms).

## User-created cards

The only way to add cards today is hand-written JSON.

- **In-app card editor**: a form per card type (rewrite, cloze, flip) with live preview, validated by the existing `validateCard`.
- **Generated ids and an owner field**; bundled and user cards currently share one hand-named id space.
- **Friendlier imports**: CSV/TSV, maybe Anki `.apkg`. Automatic furigana (e.g. kuromoji) instead of typing `{漢字|かんじ}`.
- **Answer lists are hard to author**, especially for rewrite cards. Planned AI grading fits here; a cheaper first step is letting learners self-mark an answer as correct.
- **Shared decks** need permissions, moderation and a copyright policy.

## Other grammars and languages

- **Language plug-in**: `{ normalize, tokenize, nearMatch, inputTransform, segmenter, rubyMarkup }` per language, replacing the `if` branches spread across four files.
- **More card types** for grammar the current three don't fit: multiple blanks (adjective endings), multiple choice (は vs. が), word reordering (verb position), find-the-error. `CARD_TYPES` + `CARD_RENDERERS` is already the right extension point; the schema and `validateCard` should read from it instead of repeating the list.
- **RTL scripts** (Arabic, Hebrew), only if in scope: CSS and token joining assume left-to-right with spaces.

## Real-user basics

- **Accounts and sync**: progress lives in one browser and is lost when site data is cleared. A per-day review log also feeds the planned streaks and heatmap.
- **Migrations**: cards are `version: 2`, but progress and settings keys are `v1` with no upgrade path.
- **Legal (Germany)**: a public site with accounts needs a DSGVO privacy policy and probably an Impressum. Check before launching beyond friends.
- **Report-a-card button** and basic error reporting.
- **Onboarding**: choose UI language, target language and level on first visit (today it opens on German Nominalisierung, C1).

## Suggested order

Start with the data model; everything else builds on it.

1. **Data-model refactor (schema v3)**: topics and languages as data; separate UI locale, target language and explanation language; overlays instead of copied cards; generated ids; per-language checker registry.
2. **Level**: learner profile, new-card order by level, adaptive help.
3. **Card editor and CSV import.**
4. **Backend**: accounts, sync, review log, then streaks and heatmap, then premium AI grading.
5. **Sharing and moderation, legal pages, onboarding.**
