# Custom Furigana

[한국어](README.md) · [English](README.en.md) · [日本語](README.ja.md)

Write furigana, add non-destructive automatic ruby, filter and color it by JLPT level, and search local Japanese–Korean and Japanese–English dictionaries with a single plugin. No separate Advanced Ruby plugin is required.

## Installation

After approval, search for `Custom Furigana` under **Settings → Community plugins → Browse** in Obsidian.

For manual installation, download `main.js`, `manifest.json`, and `styles.css` from the same version under [GitHub Releases](https://github.com/dnfto/custom-furigana/releases), then place them in `.obsidian/plugins/custom-furigana/` inside your vault.

## Supported syntax

- Existing syntax: `漢字{かんじ}`
- JADOU/Advanced Ruby-compatible syntax: `{漢字|かんじ}`

Existing notes do not need to be changed. Markup inside code blocks, inline code, math, or frontmatter is not rendered.

## Furigana modes

Use the book icon in the sidebar to choose a mode immediately.

- **Dictionary mode**: shows automatic ruby and authored ruby.
- **Visible mode**: shows only authored `<ruby><rt>` tags, `漢字{かんじ}`, and `{漢字|かんじ}` markup.
- **Hidden mode**: hides all automatic and authored ruby while leaving the base text visible.

Automatic ruby never edits note text; it is added as a Reading View or Live Preview decoration. The reading lexicon is split into 64 shards and only required shards are cached. A word is assigned the level of its hardest kanji. N5 through N1 and unlisted words can each be enabled, disabled, and colored independently.

Authored ruby and every automatic JLPT level have separate Light and Dark theme colors. Authored ruby defaults to the current theme accent. The reset button beside every color picker restores its default.

## Commands

- **Look up selected Japanese locally and add furigana**: Searches the selection or the Japanese word under the cursor. Inflected words are analyzed and retried using their dictionary form.
- **Add furigana manually to selected Japanese**
- **Remove furigana from selection**
- **Cycle furigana mode**

Mode, size, Light and Dark colors, automatic JLPT levels, Live Preview, and UI language can be changed under **Settings → Custom Furigana**. The UI supports Korean, English, and Japanese.

## Offline dictionaries

The plugin downloads required dictionary data once from its GitHub Release, verifies every file with SHA-256, and stores it in the current vault's plugin `dict/` folder. It then works offline. Desktop downloads about 60 MB of dictionary and tokenizer data on first launch and builds the full search index.

Desktop uses the full search index and tokenizer. On iPhone, iPad, and Android, a low-memory mode is enabled automatically: the plugin does not decompress the entire dictionary at startup and loads only the small shard containing the searched term. For stability, mobile low-memory mode performs exact headword lookup.
Automatic ruby and the mobile dictionary download and cache only the small shards they need.

### Network use disclosure

- Service: GitHub Releases at `github.com/dnfto/custom-furigana`.
- Purpose: download local Japanese-Korean and Japanese-English dictionaries, tokenizer data, and automatic-reading shards.
- Data sent: only requests for dictionary files. Note contents, search terms, and usage statistics are never sent.
- No account, API key, payment, advertising, or telemetry is used.

- Korean UI: uses a Korean Wiktionary definition only when the written headword matches exactly. Definitions from unrelated homophones are never merged.
- Missing Korean definition: automatically falls back to the English JMdict definition and labels the result accordingly.
- English or Japanese UI: continues to show English JMdict definitions.

## Data sources

- JMdict/EDICT — Electronic Dictionary Research and Development Group, CC BY-SA 4.0
- Japanese entries from Korean Wiktionary — Wiktionary contributors, CC BY-SA 4.0; extracted with Wiktextract/Kaikki
- SudachiDict-based tokenizer data — Works Applications, Apache License 2.0
- `@patdx/kuromoji` — Apache License 2.0
- `kanji-data` JLPT levels — David Gouveia, MIT

The source code is available under the [MIT License](LICENSE). See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for the separate licenses and attribution that apply to dictionary and tokenizer data.

See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for full attribution and transformation details.

## Development

```sh
npm install
npm run build
```

To rebuild the Korean dictionary from a newer dump:

```sh
npm run build:korean-dictionary -- /path/to/ko-extract.jsonl.gz dict/wiktionary-ja-ko-2026-10-01.json.gz
npm run build:mobile-dictionary -- dict/jmdict-eng-3.6.2.json.gz dict/mobile
npm run build:auto-readings -- node_modules/@patdx/kuromoji/dict dict/auto
npm run build:jlpt-levels -- /path/to/kanji-data/kanji.json src/jlptLevels.ts
```
