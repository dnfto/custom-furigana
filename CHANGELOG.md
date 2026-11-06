# Changelog

## 4.0.7

- Invalidates stale automatic-ruby work and fully rerenders Reading View when the display mode changes.
- Recognizes authored ruby even when Obsidian splits `漢字{よみ}` across multiple inline DOM elements.
- Prevents automatic ruby in blocks that still contain raw braces and restores generated markup when the plugin unloads.

## 4.0.6

- Processes authored and automatic ruby in a single Reading View pass so authored readings always take priority.
- Coalesces split automatic readings back into verified vocabulary compounds before rendering, including `低下` (`ていか`).
- Uses the requested N5–N1 default palette with separate Light and Dark colors for N2 and N1.

## 4.0.5

- Merges late per-kanji Reading View ruby back into known compounds and prevents automatic ruby from replacing authored ruby such as `下{くだ}り坂`.
- Migrated settings to Obsidian's declarative settings API; Obsidian 1.13.0 or newer is now required.

## 4.0.4

- Prefers OpenJLPT's verified vocabulary readings before automatic-reading shards.
- Ensures registered compounds such as `低下` use their word reading (`ていか`) instead of separate kanji readings (`ひく` + `した`).
- Updated the default JLPT colors for Light and Dark themes.

## 4.0.3

- Uses exact OpenJLPT vocabulary levels before falling back to kanji levels, so common words such as `自分` are classified correctly.
- Replaced the incomplete kanji-level source with OpenJLPT's supplemented N5–N1 kanji data.
- Verifies cached automatic-reading shards and replaces stale files, preventing compounds such as `低下` from falling back to separate readings.

## 4.0.2

- Replaced the furigana size slider with a free-form CSS length field.
- Treats unitless size values as pixels while supporting `px`, `em`, `rem`, `%`, and other CSS length units.
- Preserves legacy numeric settings as their original `em` values during migration.

## 4.0.1

- Updated settings headings to the official Obsidian API.
- Added build provenance attestations for release assets.
- Made English the primary README while retaining Korean and Japanese translations.
- Improved dictionary worker type safety and resolved scanner lint warnings.
- Limited automatic ruby to kanji spans while preserving okurigana, including contextual readings for `来た`, `来ます`, and related forms.

## 4.0.0

- Added non-destructive automatic furigana in Reading View and Live Preview.
- Added Dictionary, Visible, and Hidden display modes with a ribbon menu.
- Added JLPT-level filters and separate Light and Dark theme colors.
- Added local Japanese-Korean and Japanese-English dictionary lookup.
- Added Korean, English, and Japanese interfaces and documentation.
- Added low-memory, on-demand dictionary shards for mobile devices.
