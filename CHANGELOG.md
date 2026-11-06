# Changelog

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
