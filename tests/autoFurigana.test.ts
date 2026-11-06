import assert from 'node:assert/strict';

import {
	alignAutomaticReading,
	mergeCompoundAutomaticMatches,
	planRubyRanges,
} from '../src/autoFurigana';

function split(surface: string, reading: string): string {
	return alignAutomaticReading(surface, reading)
		.map((match) => `${match.base}:${match.reading}`)
		.join('|');
}

// `surface`, `reading` from the dictionary, and the expected kanji-only split.
// Everything here used to come out wrong or empty before the okurigana anchor
// was matched from the end of the reading.
const splitCases: Array<[string, string, string, string]> = [
	['okurigana kana also starts the reading', '勢い', 'いきおい', '勢:いきお'],
	['reading repeats the okurigana', '言い訳', 'いいわけ', '言:い|訳:わけ'],
	['kana suffix only', '思いつく', 'おもいつく', '思:おも'],
	['okurigana stays outside the ruby', '煙り', 'けむり', '煙:けむ'],
	['adjective', '厳しい', 'きびしい', '厳:きび'],
	['godan verb', '走る', 'はしる', '走:はし'],
	['godan verb with u', '狂う', 'くるう', '狂:くる'],
	['irregular verb', '拘る', 'かかわる', '拘:かかわ'],
	['i-adjective', '強い', 'つよい', '強:つよ'],
	['kanji run is one block', '迷子', 'まいご', '迷子:まいご'],
	['kanji run is one block', '行方', 'ゆくえ', '行方:ゆくえ'],
	['kanji run is one block', '梅雨', 'つゆ', '梅雨:つゆ'],
	['single kanji', '塊', 'かたまり', '塊:かたまり'],
	['single kanji', '魂', 'たましい', '魂:たましい'],
	['single kanji', '志', 'こころざし', '志:こころざし'],
	['single kanji', '釘', 'くぎ', '釘:くぎ'],
	['single kanji', '躾', 'しつけ', '躾:しつけ'],
	['single kanji', '雷', 'かみなり', '雷:かみなり'],
	['single kanji', '氷', 'こおり', '氷:こおり'],
	['single kanji', '煙', 'けむり', '煙:けむり'],
	['leading kana', 'お金', 'おかね', '金:かね'],
	['internal kana', '売り場', 'うりば', '売:う|場:ば'],
	['internal kana', '追い越す', 'おいこす', '追:お|越:こ'],
];

for (const [name, surface, reading, expected] of splitCases) {
	assert.equal(split(surface, reading), expected, `${name}: ${surface} / ${reading}`);
}

// A word that cannot be split must still get a whole-word ruby instead of
// disappearing from the document.
assert.equal(split('お茶', 'ちゃ'), '', 'unmatched leading kana yields no kanji split');
const fallback = planRubyRanges('お茶', 'ちゃ', 100);
assert.equal(fallback.length, 1, 'fallback produces one whole-word match');
assert.deepEqual(
	{
		start: fallback[0].start,
		end: fallback[0].end,
		base: fallback[0].base,
		reading: fallback[0].reading,
	},
	{ start: 100, end: 102, base: 'お茶', reading: 'ちゃ' },
	'fallback covers the whole surface at the requested offset',
);

// Whole-word scope (the `rubyScope: 'word'` setting) keeps the okurigana inside.
const wholeWord = planRubyRanges('煙り', 'けむり', 0, 'word');
assert.equal(wholeWord.length, 1, 'whole-word scope returns a single match');
assert.equal(wholeWord[0].base, '煙り', 'whole-word scope covers the okurigana');
assert.equal(wholeWord[0].reading, 'けむり', 'whole-word scope keeps the full reading');

const offsetWord = planRubyRanges('勢い', 'いきおい', 42, 'word');
assert.equal(offsetWord[0].start, 42, 'whole-word scope keeps the offset');
assert.equal(offsetWord[0].end, 44, 'whole-word scope keeps the end offset');

// Adjacent matches collapse into the compound the JLPT table knows about.
const merged = mergeCompoundAutomaticMatches([
	{ start: 0, end: 1, base: '大', reading: 'おお', jlptLevel: 'N5' },
	{ start: 1, end: 2, base: '人', reading: 'ひと', jlptLevel: 'N5' },
]);
assert.equal(merged.length, 1, 'adjacent matches merge');
assert.equal(merged[0].base, '大人', 'merged base is the compound');
assert.equal(merged[0].reading, 'おとな', 'merged reading is the compound reading');

console.log(`automatic reading alignment passed (${splitCases.length} splits)`);
