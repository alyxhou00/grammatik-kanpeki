# Ideas: progress trend, practice history, mistake notebook

- **Date:** 2026-11-05
- **Source:** the progress page of a Japanese JLPT practice site (jp.ikuchannel.com), as seen while doing one N5 daily quiz.
- **Status:** ideas only, nothing planned yet. Pick items from here for the to-do list.

The site is a quiz site (fixed question sets, multiple choice), not a spaced-repetition app, so not every feature carries over one-to-one. Each section says what the site does, what we have today, and what our version could look like.

## What the page shows

The page has four parts, from top to bottom:

1. **Accuracy trend**: a line of the overall correct rate per day over the last 30 days, across all practice modes. Before there is enough data it shows an empty state that explains what will appear ("practice a few days and you'll see your progress") and a button to the daily quiz.
2. **Practice history**: one row per finished session in the last 30 days: mode, level, date, score as a percent and as a fraction (25 %, 2/8). Filter chips per mode. A note under the list says that only 30 days of detail are kept while streaks and totals are kept for good, and that the data lives in the browser and is lost when the browser data is cleared.
3. **Mistake notebook (錯題本)**: every question you got wrong, with two counters: *to review* and *overcome* (已克服). Each entry shows level, question type, part of speech, date, the question, the correct answer, a short explanation, and a link to the matching grammar or vocabulary page. An entry can be marked as overcome.
4. **Weak spots and radar**:
   - "Where do you go wrong most?": the mistakes grouped by question type, by grammar pattern, by word, and by level, each with a count. Clicking a group filters the notebook to it. Overcome mistakes are left out.
   - A radar chart of accuracy on the quiz's five axes (kanji reading, kanji writing, context fill-in, synonyms, grammar), next to a ring showing how many mistakes are overcome.
   - Filter chips (level, type, show overcome), an active-filter chip with ×, and "clear all".

## What we have today

| Site feature | Grammatik Kanpeki today |
| --- | --- |
| Streak, totals | Yes: streak flame and Lernverlauf heatmap (`js/studylog.js`) |
| Accuracy per day | Not shown, but the study log already stores `n` and `again` per day and language, so accuracy ≈ `1 − again / n` can be drawn from data we have |
| Practice sessions | No session concept; a study run is not recorded as a unit |
| List of wrong answers | Partly: SRS brings failed cards back, and leeches (8 lapses) get a badge in the card list. There is no "cards I got wrong recently" view, and a new card graded Again in learning is not a lapse |
| Grouping by type | Cards have `task`, `meta` facets (verb class, adjective class), `tags`, `level`, and sub-topics, but nothing groups mistakes by them |
| Link to explanation | Cards have an `explanation` shown after answering; there are no grammar reference pages to link to |
| "Data is in your browser" note | Only in the README |

## Ideas for us, roughly by value and effort

### 1. Accuracy trend in Lernverlauf (small)

Add a 30-day line (or bar) chart of `1 − again / n` per day under the heatmap, per language. No new data needed. Show an empty state with a short explanation and a "start learning" button until there are at least ~3 study days.

Caveat: in an SRS app the rate is not a clean progress signal, because the scheduler keeps showing harder cards. Label it as "answers right first time", not as a level.

### 2. Mistake view ("Fehlerheft / 錯題本") (medium)

A filter in the card list, or its own screen, for cards answered wrong recently, with *to review* / *overcome* counts.

- Needs one small addition to card progress: the time of the last wrong answer (`lastAgain`) and maybe a short count of wrong answers. Lapses alone miss mistakes on new and learning cards.
- "Overcome" can be automatic instead of a button: a card counts as overcome after it is answered right N times in a row since its last mistake (or when it graduates to an interval of, say, ≥ 7 days). A manual "mark as overcome" can stay as an extra.
- From the view, "study these now" starts a practice run (like Alle üben) over just these cards, without changing the schedule.
- Show the user's wrong answer next to the correct one when we have it. The site only shows the correct answer; for typed answers our wrong answer is the more useful part. This means storing the last wrong answer text per card (short, last one only).

### 3. Weak spots (medium, after 2)

Group the mistake view by what we already have on cards: sub-topic, `task` chip, facets (`verbClass`, `adjClass`, …), tags, level. Show counts, biggest first, and make each group a filter. For Japanese verb conjugation this answers questions like "do I mostly fail て形 of godan verbs?", which fits this app better than the site's per-word grouping.

### 4. Radar or bar chart per sub-topic / facet (small, after 3)

Accuracy per sub-topic or per facet value. A radar only reads well with 4–7 axes of the same kind; a sorted bar chart works for any count and is easier to read, so prefer bars unless the axes are fixed.

### 5. Session summary and history (medium)

Record a study run as a session: start, end, deck, cards seen, right first time. Show a summary at the end of a run ("12 cards, 9 right, 3 to review → view mistakes") and a 30-day history list with filters. Keep detail for 30 days and only the per-day counts for longer, as the site does; this also fits the localStorage size limit noted in `js/studylog.js`.

### 6. Links from a mistake to an explanation (later)

The site links each mistake to a grammar or word page. We have no reference pages. Options: a per-topic notes page (Markdown in `data/`), or a link field on cards. Not worth it until there is reference content.

### 7. "Your data is in this browser" note (tiny)

Put a one-line note under Lernverlauf and the mistake view: data stays in this browser, use export to move it, clearing browser data deletes it. It matches the backend-optional decision in [`docs/reviews/2026-11-05-backend-optional-review.md`](../reviews/2026-11-05-backend-optional-review.md) and sets the right expectation.

## Things the site does well that apply anywhere

- Empty states that explain what will appear and link to the next action, instead of an empty chart.
- Every counter is also a filter: click a weak spot, see those items.
- Honest about storage and retention limits on the page itself.
