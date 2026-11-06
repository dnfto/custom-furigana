# Custom Furigana

[한국어](README.ko.md) · [English](README.md) · [日本語](README.ja.md)

ふりがなの入力、本文を書き換えない自動ルビ、JLPTレベル別の表示と色、ローカルの日韓・日英辞書検索を、このプラグインだけで処理します。Advanced Rubyなどの別プラグインは不要です。

## インストール

公式ディレクトリの承認後は、Obsidianの **設定 → コミュニティプラグイン → 閲覧** から `Custom Furigana` を検索してインストールできます。

手動インストールでは、[GitHub Releases](https://github.com/dnfto/custom-furigana/releases)から同じバージョンの `main.js`、`manifest.json`、`styles.css` をダウンロードし、Vault内の `.obsidian/plugins/custom-furigana/` に配置してください。

## 対応記法

- 既存の記法：`漢字{かんじ}`
- JADOU/Advanced Ruby互換記法：`{漢字|かんじ}`

既存ノートを書き換える必要はありません。コードブロック、インラインコード、数式、フロントマター内の記法は変換されません。

## ふりがなモード

サイドバーの本アイコンから、次のモードをすぐに選択できます。

- **辞書モード**：自動ルビと手動で書いたルビをすべて表示します。
- **表示モード**：実際の`<ruby><rt>`タグ、`漢字{かんじ}`、`{漢字|かんじ}`の手動ルビのみ表示します。
- **非表示モード**：自動・手動ルビをすべて隠し、本文だけを表示します。

自動ルビはノート本文を変更せず、閲覧ビューとライブプレビューの装飾として追加されます。読み辞書は64個のシャードに分割され、必要なシャードだけをキャッシュします。単語のレベルには、含まれる漢字のうち最も難しいJLPTレベルを使用します。N5～N1と未分類を個別に有効・無効化し、色を設定できます。

手動ルビとJLPT別自動ルビには、ライト・ダークテーマそれぞれの色を設定できます。手動ルビの初期値は現在のテーマのアクセントカラーです。各カラーピッカー横のリセットボタンで既定値に戻せます。

## コマンド

- **選択した日本語をローカル辞書で検索してふりがなを追加**：選択範囲、またはカーソル位置の日本語を検索します。活用形は形態素解析によって基本形に戻して再検索します。
- **選択した日本語にふりがなを手動で追加**
- **選択範囲のふりがなを削除**
- **ふりがなモードを切り替え**

モード、サイズ、ライト・ダーク色、JLPT別自動ルビ、ライブプレビュー、UI言語は **設定 → Custom Furigana** で変更できます。ふりがなのサイズは `px`、`em`、`rem`、`%` などのCSS単位を直接入力でき、単位なしの数値は `px` として扱われます。UIは韓国語、英語、日本語に対応しています。

## オフライン辞書

プラグインは必要な辞書データをGitHub Releaseから一度だけダウンロードし、SHA-256で検証して現在のVaultのプラグイン `dict/` フォルダに保存します。以後はオフラインで動作します。デスクトップでは初回起動時に約60MBの辞書・形態素データを取得し、完全な検索インデックスを作成します。

デスクトップでは完全な検索インデックスと形態素解析器を使用します。iPhone・iPad・Androidでは低メモリモードが自動的に有効になり、起動時に辞書全体を展開せず、検索語を含む小さな辞書シャードだけを読み込みます。安定性を優先し、モバイル低メモリモードでは見出し語の完全一致検索を行います。
自動ルビとモバイル辞書は、必要な小さなシャードだけをダウンロードしてキャッシュします。

### ネットワーク使用の開示

- 接続先：`github.com/dnfto/custom-furigana` のGitHub Releases。
- 目的：ローカル日韓・日英辞書、形態素データ、自動読みシャードの取得。
- 送信データ：辞書ファイルのリクエストのみ。ノート内容、検索語、利用統計は送信しません。
- アカウント、APIキー、支払い、広告、テレメトリはありません。

- 韓国語UI：韓国語版Wiktionaryの見出し表記が完全に一致する場合のみ韓国語語義を使用し、同音異義語の語義は混在させません。
- 韓国語語義がない単語：JMdictの英語語義へ自動的にフォールバックし、その旨を結果に表示します。
- 英語・日本語UI：従来どおりJMdictの英語語義を表示します。

## データ出典

- JMdict/EDICT — Electronic Dictionary Research and Development Group, CC BY-SA 4.0
- 韓国語版Wiktionaryの日本語項目 — Wiktionary contributors, CC BY-SA 4.0、Wiktextract/Kaikkiで抽出
- SudachiDict由来の形態素解析データ — Works Applications, Apache License 2.0
- `@patdx/kuromoji` — Apache License 2.0
- `kanji-data` JLPTレベル — David Gouveia、MIT

ソースコードは [MIT License](LICENSE) で公開しています。辞書・形態素データに適用される別個のライセンスと帰属表示は [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) を参照してください。

著作権表示と加工内容の詳細は [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) を参照してください。

## 開発

```sh
npm install
npm run build
```

新しいダンプから韓国語辞書を再生成する場合：

```sh
npm run build:korean-dictionary -- /path/to/ko-extract.jsonl.gz dict/wiktionary-ja-ko-2026-10-01.json.gz
npm run build:mobile-dictionary -- dict/jmdict-eng-3.6.2.json.gz dict/mobile
npm run build:auto-readings -- node_modules/@patdx/kuromoji/dict dict/auto
npm run build:jlpt-levels -- /path/to/kanji-data/kanji.json src/jlptLevels.ts
```
