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

## kanji-data JLPT levels

The generated `src/jlptLevels.ts` map uses the `jlpt_new` field from David
Gouveia's `kanji-data` project. The plugin retains only kanji-to-level mappings
and determines a word's display level from its hardest listed kanji.

Copyright © 2019 David Gouveia

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

- https://github.com/davidluzgouveia/kanji-data
