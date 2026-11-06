import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const [dataFolder, outputPath] = process.argv.slice(2);
if (!dataFolder || !outputPath) {
	console.error(
		'Usage: node scripts/build-jlpt-levels.mjs <openjlpt-data/json> <output.ts>',
	);
	process.exit(1);
}

const levels = [5, 4, 3, 2, 1];
const vocabulary = new Map();
const kanji = new Map();

for (const level of levels) {
	const vocabularyEntries = JSON.parse(
		await readFile(join(dataFolder, 'vocab', `n${level}.json`), 'utf8'),
	);
	for (const entry of vocabularyEntries) {
		if (!/\p{Script=Han}/u.test(entry.word) || vocabulary.has(entry.word)) continue;
		vocabulary.set(entry.word, { level, reading: entry.reading });
	}

	const kanjiEntries = JSON.parse(
		await readFile(join(dataFolder, 'kanji', `n${level}.json`), 'utf8'),
	);
	for (const entry of kanjiEntries) {
		if (!kanji.has(entry.character)) kanji.set(entry.character, level);
	}
}

function kanjiRecordLines(entries) {
	return [...entries]
		.sort(([left], [right]) => left.localeCompare(right, 'ja'))
		.map(([text, level]) => `\t${JSON.stringify(text)}: ${level},`)
		.join('\n');
}

function vocabularyRecordLines(entries) {
	return [...entries]
		.sort(([left], [right]) => left.localeCompare(right, 'ja'))
		.map(
			([text, value]) =>
				`\t${JSON.stringify(text)}: [${value.level}, ${JSON.stringify(value.reading)}],`,
		)
		.join('\n');
}

const maxVocabularyLength = Math.max(
	0,
	...[...vocabulary.keys()].map((word) => [...word].length),
);

const output = `// Generated from OpenJLPT 0.3.0 (CC BY-SA 4.0).
// Source revision: 0d1d3410bec90bd4098a7c72de820543cb4f707c
export type JlptLevel = 'N5' | 'N4' | 'N3' | 'N2' | 'N1' | 'unlisted';

const JLPT_VOCABULARY: Record<string, readonly [1 | 2 | 3 | 4 | 5, string]> = {
${vocabularyRecordLines(vocabulary)}
};

const JLPT_KANJI_LEVELS: Record<string, 1 | 2 | 3 | 4 | 5> = {
${kanjiRecordLines(kanji)}
};

export const MAX_JLPT_VOCABULARY_LENGTH = ${maxVocabularyLength};

export function jlptReadingForText(text: string): string | null {
	return JLPT_VOCABULARY[text]?.[1] ?? null;
}

export function jlptLevelForText(text: string): JlptLevel {
	const vocabularyLevel = JLPT_VOCABULARY[text]?.[0];
	if (vocabularyLevel) return \`N\${vocabularyLevel}\` as JlptLevel;

	let hardest: 1 | 2 | 3 | 4 | 5 | null = null;
	let hasKanji = false;
	for (const character of text) {
		if ('々〆ヶ'.includes(character)) continue;
		if (!/\\p{Script=Han}/u.test(character)) continue;
		hasKanji = true;
		const level = JLPT_KANJI_LEVELS[character];
		if (!level) return 'unlisted';
		if (hardest === null || level < hardest) hardest = level;
	}
	return hasKanji && hardest !== null ? (\`N\${hardest}\` as JlptLevel) : 'unlisted';
}
`;

await writeFile(outputPath, output);
console.log(
	`Wrote ${vocabulary.size} JLPT vocabulary entries and ${kanji.size} kanji entries to ${outputPath}`,
);
