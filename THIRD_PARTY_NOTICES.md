# Third-party data and software

The local dictionary feature uses data derived from the following projects.

## JMdict/EDICT

Copyright © 2000–2026 Electronic Dictionary Research and Development Group.
The `jmdict-eng-3.6.2.json.gz` release asset downloaded by the plugin is distributed under the Creative Commons Attribution-ShareAlike 4.0 International license. The JSON conversion is provided by `jmdict-simplified`.

- https://www.edrdg.org/wiki/index.php/JMdict-EDICT_Dictionary_Project
- https://creativecommons.org/licenses/by-sa/4.0/
- https://github.com/scriptin/jmdict-simplified

## SudachiDict tokenizer data

The compressed tokenizer dictionary files are derived from SudachiDict, Copyright © Works Applications Co., Ltd., and are distributed under the Apache License 2.0.

- https://github.com/WorksApplications/SudachiDict
- https://www.apache.org/licenses/LICENSE-2.0

## Korean Wiktionary definitions

The `wiktionary-ja-ko-2026-10-01.json.gz` release asset downloaded by the plugin is derived from the Korean Wiktionary dump dated 2026-10-01 and extracted by Wiktextract/Kaikki. Wiktionary text is contributed by its respective authors and is available under the Creative Commons Attribution-ShareAlike 4.0 International license unless otherwise noted.

Changes made for this plugin: Japanese-language entries were selected; headwords, Korean glosses, and Korean part-of-speech labels were retained; duplicate records were merged; and the resulting JSON was gzip-compressed. This derived data file is distributed under CC BY-SA 4.0.

- https://ko.wiktionary.org/
- https://kaikki.org/dictionary/rawdata.html
- https://github.com/tatuylonen/wiktextract
- https://creativecommons.org/licenses/by-sa/4.0/

## @patdx/kuromoji

JavaScript Japanese morphological analyzer distributed under the Apache License 2.0.

The automatic-reading shards in `dict/auto/` are generated from the tokenizer
dictionary distributed with `@patdx/kuromoji`. Only surface forms and readings
are retained, the lowest-cost reading is selected for duplicate surface forms,
and the resulting map is split into 64 gzip-compressed shards.

- https://github.com/patdx/kuromoji.js

## OpenJLPT vocabulary and kanji levels

The generated `src/jlptLevels.ts` map uses vocabulary and kanji level
assignments from OpenJLPT 0.3.0, revision
`0d1d3410bec90bd4098a7c72de820543cb4f707c`. The plugin retains only Japanese
spellings and N5–N1 assignments. Exact vocabulary levels take priority; words
that are not in the vocabulary list fall back to the hardest listed kanji.

Contains data from OpenJLPT (CC BY-SA 4.0), which uses JMdict and KANJIDIC2
(EDRDG), Jonathan Waller's JLPT lists, and Tatoeba. The generated level map is
distributed under CC BY-SA 4.0.

- https://github.com/evanclan/OpenJLPT
- https://creativecommons.org/licenses/by-sa/4.0/
