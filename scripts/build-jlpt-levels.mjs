import { readFile, writeFile } from 'node:fs/promises';

const [inputPath, outputPath] = process.argv.slice(2);
if (!inputPath || !outputPath) {
	console.error(
		'Usage: node scripts/build-jlpt-levels.mjs <kanji-data.json> <output.ts>',
	);
	process.exit(1);
}

const source = JSON.parse(await readFile(inputPath, 'utf8'));
const entries = Object.entries(source)
	.filter(([, value]) =>
		Number.isInteger(value.jlpt_new) && value.jlpt_new >= 1 && value.jlpt_new <= 5,
	)
	.sort(([left], [right]) => left.localeCompare(right, 'ja'));
const lines = entries.map(
	([kanji, value]) => `\t${JSON.stringify(kanji)}: ${value.jlpt_new},`,
);
const output = `// Generated from david luzgouveia/kanji-data (MIT).\nexport type JlptLevel = 'N5' | 'N4' | 'N3' | 'N2' | 'N1' | 'unlisted';\n\nconst JLPT_KANJI_LEVELS: Record<string, 1 | 2 | 3 | 4 | 5> = {\n${lines.join('\n')}\n};\n\nexport function jlptLevelForText(text: string): JlptLevel {\n\tlet hardest: 1 | 2 | 3 | 4 | 5 | null = null;\n\tlet hasKanji = false;\n\tfor (const character of text) {\n\t\tif ('々〆ヶ'.includes(character)) continue;\n\t\tif (!/\\p{Script=Han}/u.test(character)) continue;\n\t\thasKanji = true;\n\t\tconst level = JLPT_KANJI_LEVELS[character];\n\t\tif (!level) return 'unlisted';\n\t\tif (hardest === null || level < hardest) hardest = level;\n\t}\n\treturn hasKanji && hardest !== null ? (\`N\${hardest}\` as JlptLevel) : 'unlisted';\n}\n`;
await writeFile(outputPath, output);
console.log(`Wrote ${entries.length} JLPT kanji entries to ${outputPath}`);
