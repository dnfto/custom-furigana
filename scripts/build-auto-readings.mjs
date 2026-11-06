import { mkdir, writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { TokenizerBuilder } from '@patdx/kuromoji';
import NodeDictionaryLoader from '@patdx/kuromoji/node';

const [dictionaryFolder, outputFolder] = process.argv.slice(2);
if (!dictionaryFolder || !outputFolder) {
	console.error(
		'Usage: node scripts/build-auto-readings.mjs <kuromoji-dict-folder> <output-folder>',
	);
	process.exit(1);
}

const SHARD_COUNT = 64;
const HAS_KANJI = /[\p{Script=Han}々〆ヶ]/u;

function katakanaToHiragana(value) {
	return value.replace(/[ァ-ヶ]/g, (character) =>
		String.fromCharCode(character.charCodeAt(0) - 0x60),
	);
}

function shardIndex(value) {
	const firstCharacter = [...value][0] ?? '';
	let hash = 0x811c9dc5;
	for (let index = 0; index < firstCharacter.length; index += 1) {
		hash ^= firstCharacter.charCodeAt(index);
		hash = Math.imul(hash, 0x01000193);
	}
	return (hash >>> 0) % SHARD_COUNT;
}

const tokenizer = await new TokenizerBuilder({
	loader: new NodeDictionaryLoader({ dic_path: dictionaryFolder }),
}).build();
const dictionary = tokenizer.token_info_dictionary;
const bestReadings = new Map();
const tokenIds = new Set(Object.values(dictionary.target_map).flat());

for (const tokenId of tokenIds) {
	const features = dictionary.getFeatures(String(tokenId)).split(',');
	const surface = features[0];
	const reading = features[8];
	if (!surface || !reading || reading === '*' || !HAS_KANJI.test(surface)) continue;
	const cost = dictionary.dictionary.getShort(Number(tokenId) + 4);
	const current = bestReadings.get(surface);
	if (!current || cost < current.cost) bestReadings.set(surface, { reading, cost });
}

const shards = Array.from({ length: SHARD_COUNT }, () => new Map());
for (const [surface, value] of bestReadings) {
	shards[shardIndex(surface)].set(surface, katakanaToHiragana(value.reading));
}

await mkdir(outputFolder, { recursive: true });
let compressedBytes = 0;
for (let index = 0; index < SHARD_COUNT; index += 1) {
	const sorted = [...shards[index]].sort(([left], [right]) =>
		left.localeCompare(right, 'ja'),
	);
	const maxLength = Math.max(0, ...sorted.map(([surface]) => [...surface].length));
	const compressed = gzipSync(
		JSON.stringify({ maxLength, entries: Object.fromEntries(sorted) }),
		{ level: 9 },
	);
	compressedBytes += compressed.byteLength;
	await writeFile(
		`${outputFolder}/auto-${String(index).padStart(2, '0')}.json.gz`,
		compressed,
	);
}

console.log(
	`Wrote ${SHARD_COUNT} automatic-reading shards with ${bestReadings.size} surfaces (${(
		compressedBytes /
		1024 /
		1024
	).toFixed(1)} MiB)`,
);
