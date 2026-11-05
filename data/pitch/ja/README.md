# Japanese pitch-accent data

The files in this folder hold the pitch accents that `js/pitch.js` draws over single words.

**Source:** `accents.txt` from [Kanjium](https://github.com/mifunetoshiro/kanjium). Its README credits the pitch-accent notation to Uros O.
**License:** [Creative Commons Attribution-ShareAlike 4.0 International](https://creativecommons.org/licenses/by-sa/4.0/). The converted files in this folder are under the same license. The rest of the app is not covered by it.

**Changes from the source:** converted to JSON by `tools/pitch.mjs` and split into 128 files by a hash of the reading. Readings are in hiragana. Part-of-speech labels and repeated accents are dropped.

Each file maps a reading to the words with that reading, and each word to its accents, most common first. The number is the mora after which the pitch drops, and `0` means flat:

```json
{ "はし": { "箸": [1], "橋": [2], "端": [0] } }
```

To rebuild the files after Kanjium changes:

```bash
curl -LO https://raw.githubusercontent.com/mifunetoshiro/kanjium/master/data/source_files/raw/accents.txt
```

```bash
node tools/pitch.mjs accents.txt
```
