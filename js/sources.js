// Card sources: the short code a card stores in "source" → the full name of where it comes from.
// The card list shows the code; hovering it shows the full name.
//
// To add a source, add an entry here and use its code as "source" in the cards:
//   code   lowercase letters, digits, "." and "-" (e.g. "ktxc1kb"); never change a code once cards use it
//   name   the full name, either one string (book titles) or one per UI language: { de, 'zh-Hant', en }
//
// Codes not listed here (the user's own cards, "import:<file>", free text typed in the card form) are shown as they are.
// Every bundled card must use a listed code (tests/data.test.mjs checks this).

import { loc } from './text.js';

export const SOURCES = {
  demo: { name: { de: 'Beispielkarten', 'zh-Hant': '範例卡片', en: 'Demo cards' } },
  demo2: { name: { de: 'Beispielkarten, Teil 2', 'zh-Hant': '範例卡片（第二組）', en: 'Demo cards, set 2' } },
  demo3: { name: { de: 'Beispielkarten, Teil 3', 'zh-Hant': '範例卡片（第三組）', en: 'Demo cards, set 3' } },
  ktxc1kb: { name: 'Kontext C1 Kursbuch' },
};

export const SOURCE_CODE = /^[a-z0-9][a-z0-9.-]*$/;

/** The registry entry for a source code, or null. */
export const sourceInfo = (code) => (Object.hasOwn(SOURCES, code || '') ? SOURCES[code] : null);

/** The full name of a source in the preferred languages (e.g. ['zh-Hant', 'en']), or '' for an unknown code. */
export const sourceName = (code, prefer = []) => loc(sourceInfo(code)?.name, prefer);
