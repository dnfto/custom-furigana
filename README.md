# Custom Furigana

[한국어](README.md) · [English](README.en.md) · [日本語](README.ja.md)

후리가나 작성, 원문을 바꾸지 않는 자동 RT, JLPT 급수별 표시와 색상, 로컬 일한·일영 사전 검색을 한 플러그인에서 처리합니다. Advanced Ruby 같은 별도 플러그인이 필요하지 않습니다.

## 설치

공식 목록 승인 후에는 Obsidian의 **설정 → 커뮤니티 플러그인 → 탐색**에서 `Custom Furigana`를 검색해 설치할 수 있습니다.

수동 설치는 [GitHub Releases](https://github.com/dnfto/custom-furigana/releases)에서 같은 버전의 `main.js`, `manifest.json`, `styles.css`를 받아 볼트의 `.obsidian/plugins/custom-furigana/` 폴더에 넣으면 됩니다.

## 지원 문법

- 기존 문법: `漢字{かんじ}`
- JADOU/Advanced Ruby 호환 문법: `{漢字|かんじ}`

기존 노트는 바꿀 필요가 없습니다. 코드 블록, 인라인 코드, 수식, 프론트매터 안의 문법은 렌더링하지 않습니다.

## 후리가나 모드

사이드바의 책 아이콘을 누르면 다음 모드를 바로 선택할 수 있습니다.

- **사전 모드**: 자동 RT와 직접 작성한 RT를 모두 표시합니다.
- **보임 모드**: 실제 `<ruby><rt>` 태그, `漢字{かんじ}`, `{漢字|かんじ}`처럼 직접 작성한 RT만 표시합니다.
- **숨김 모드**: 자동·직접 작성 RT를 모두 숨기고 본문만 표시합니다.

자동 RT는 노트 텍스트를 수정하지 않고 읽기 모드와 라이브 프리뷰에만 장식으로 추가됩니다. 자동 읽기 사전은 64개 조각으로 나뉘며 필요한 조각만 메모리에 올립니다. 단어의 JLPT 급수는 포함된 한자 중 가장 어려운 급수를 사용합니다. N5~N1과 미분류를 각각 켜거나 끄고 색상을 지정할 수 있습니다.

라이트 모드와 다크 모드의 직접 작성 RT 및 JLPT별 자동 RT 색상을 따로 지정할 수 있습니다. 직접 작성 RT의 기본값은 현재 테마의 포인트 색상이며, 각 색상 선택기 옆 초기화 버튼으로 기본값을 복원할 수 있습니다.

## 명령

- **선택한 일본어를 로컬 사전에서 찾아 후리가나 추가**: 선택 영역 또는 커서 아래 일본어를 로컬 사전에서 검색합니다. 활용형은 형태소 분석기로 기본형을 찾아 다시 검색합니다.
- **선택한 일본어에 후리가나 직접 추가**
- **선택 영역의 후리가나 제거**
- **후리가나 모드 순환**

후리가나 모드, 크기, 라이트·다크 색상, JLPT 급수별 자동 RT, 라이브 프리뷰와 UI 언어는 **설정 → Custom Furigana**에서 변경할 수 있습니다. UI는 한국어, 영어, 일본어를 지원합니다.

## 오프라인 사전

플러그인은 필요한 사전 데이터를 최초 1회 GitHub Release에서 다운로드하고 현재 볼트의 플러그인 `dict/` 폴더에 저장합니다. 다운로드한 파일은 SHA-256 검증 후 사용하며, 이후에는 오프라인으로 작동합니다. 데스크톱에서는 최초 실행 시 약 60MB의 사전·형태소 데이터를 받고 전체 검색 인덱스를 만듭니다.

데스크톱에서는 전체 검색 인덱스와 형태소 분석기를 사용합니다. iPhone·iPad·Android에서는 앱 시작 시 전체 사전을 압축 해제하지 않고, 검색한 단어에 해당하는 작은 사전 조각 하나만 읽는 저메모리 모드가 자동 적용됩니다. 모바일 저메모리 모드는 안정성을 위해 정확한 표제어 검색을 사용합니다.
자동 RT와 모바일 사전은 필요한 작은 조각만 다운로드하고 캐시합니다.

### 네트워크 사용 공지

- 접속 대상: `github.com/dnfto/custom-furigana` GitHub Release
- 목적: 로컬 일한·일영 사전, 형태소 데이터, 자동 RT 읽기 조각 다운로드
- 전송 데이터: 사전 파일 요청만 전송하며 노트 내용, 검색어, 사용 통계는 전송하지 않습니다.
- 계정, API 키, 결제, 광고, 텔레메트리는 없습니다.

- 한국어 UI: 한국어판 Wiktionary에서 실제 표기가 정확히 일치하는 일본어 표제어의 뜻만 표시합니다. 읽기가 같은 다른 단어의 뜻은 섞지 않습니다.
- 한국어 뜻이 없는 단어: JMdict 영어 뜻으로 자동 대체하며 결과에 이를 표시합니다.
- 영어·일본어 UI: 기존처럼 JMdict 영어 뜻을 표시합니다.

## 데이터 출처

- JMdict/EDICT — Electronic Dictionary Research and Development Group, CC BY-SA 4.0
- 한국어판 Wiktionary 일본어 항목 — Wiktionary contributors, CC BY-SA 4.0; Wiktextract/Kaikki로 추출
- SudachiDict 기반 형태소 분석 데이터 — Works Applications, Apache License 2.0
- `@patdx/kuromoji` — Apache License 2.0
- `kanji-data` JLPT 급수 데이터 — David Gouveia, MIT

소스 코드는 [MIT License](LICENSE)로 공개합니다. 사전·형태소 데이터의 별도 라이선스와 귀속 정보는 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)를 참고하세요.

자세한 저작권과 가공 내역은 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)를 참조하세요.

## 개발

```sh
npm install
npm run build
```

한국어 사전 파일을 새 덤프로 다시 만들려면 다음 명령을 사용합니다.

```sh
npm run build:korean-dictionary -- /path/to/ko-extract.jsonl.gz dict/wiktionary-ja-ko-2026-10-01.json.gz
npm run build:mobile-dictionary -- dict/jmdict-eng-3.6.2.json.gz dict/mobile
npm run build:auto-readings -- node_modules/@patdx/kuromoji/dict dict/auto
npm run build:jlpt-levels -- /path/to/kanji-data/kanji.json src/jlptLevels.ts
```
