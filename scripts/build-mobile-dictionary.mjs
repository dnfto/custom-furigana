import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { gunzipSync, gzipSync } from 'node:zlib';
import { dirname, join } from 'node:path';

const [inputPath, outputFolder] = process.argv.slice(2);
if (!inputPath || !outputFolder) {
	console.error(
		'Usage: node scripts/build-mobile-dictionary.mjs <jmdict.json.gz> <output-folder>',
	);
	process.exit(1);
}

const SHARD_COUNT = 64;

function shardIndex(term) {
	let hash = 0x811c9dc5;
	for (let index = 0; index < term.length; index += 1) {
		hash ^= term.charCodeAt(index);
		hash = Math.imul(hash, 0x01000193);
	}
	return (hash >>> 0) % SHARD_COUNT;
}

const dictionary = JSON.parse(gunzipSync(await readFile(inputPath)).toString('utf8'));
const shards = Array.from({ length: SHARD_COUNT }, () => new Map());

for (const entry of dictionary.words ?? []) {
	const compactEntry = {
		id: entry.id,
		kanji: (entry.kanji ?? []).map(({ common, text }) => ({ common, text })),
		kana: (entry.kana ?? []).map(
			({ common, text, appliesToKanji }) => ({ common, text, appliesToKanji }),
		),
		sense: (entry.sense ?? []).map(({ partOfSpeech, gloss }) => ({
			partOfSpeech,
			gloss: (gloss ?? [])
				.filter(({ lang }) => lang === 'eng')
				.map(({ lang, text }) => ({ lang, text })),
		})),
	};
	const terms = new Set([
		...(entry.kanji ?? []).map((form) => form.text),
		...(entry.kana ?? []).map((form) => form.text),
	]);
	for (const term of terms) {
		if (!term) continue;
		const shard = shards[shardIndex(term)];
		const entries = shard.get(term) ?? [];
		entries.push(compactEntry);
		shard.set(term, entries);
	}
}

await mkdir(outputFolder, { recursive: true });
let compressedBytes = 0;
for (let index = 0; index < SHARD_COUNT; index += 1) {
	const entries = Object.fromEntries(
		[...shards[index]].sort(([left], [right]) => left.localeCompare(right, 'ja')),
	);
	const compressed = gzipSync(
		JSON.stringify({ version: '3.6.2', entries }),
		{ level: 9 },
	);
	compressedBytes += compressed.byteLength;
	const filename = `jmdict-${String(index).padStart(2, '0')}.json.gz`;
	await writeFile(join(outputFolder, filename), compressed);
}

await writeFile(
	join(dirname(outputFolder), 'mobile-jmdict-manifest.json'),
	JSON.stringify(
		{ version: '3.6.2', shardCount: SHARD_COUNT, compressedBytes },
		null,
		2,
	),
);

console.log(
	`Wrote ${SHARD_COUNT} mobile dictionary shards (${(
		compressedBytes /
		1024 /
		1024
	).toFixed(1)} MiB)`,
);
