import { createReadStream, createWriteStream } from 'node:fs';
import { createGunzip, createGzip } from 'node:zlib';
import { createInterface } from 'node:readline';

const [inputPath, outputPath] = process.argv.slice(2);
if (!inputPath || !outputPath) {
	console.error(
		'Usage: node scripts/build-korean-dictionary.mjs <ko-extract.jsonl.gz> <output.json.gz>',
	);
	process.exit(1);
}

const entries = new Map();
const input = createInterface({
	input: createReadStream(inputPath).pipe(createGunzip()),
	crlfDelay: Infinity,
});

function addUnique(target, values) {
	for (const value of values) {
		if (typeof value === 'string' && value && !target.includes(value)) {
			target.push(value);
		}
	}
}

for await (const line of input) {
	let source;
	try {
		source = JSON.parse(line);
	} catch {
		continue;
	}
	if (source.lang_code !== 'ja' || typeof source.word !== 'string') continue;

	const definitions = (source.senses ?? []).flatMap((sense) => sense.glosses ?? []);
	if (definitions.length === 0) continue;

	const record = entries.get(source.word) ?? {
		definitions: [],
		partsOfSpeech: [],
	};
	addUnique(record.definitions, definitions);
	addUnique(record.partsOfSpeech, [source.pos_title]);
	entries.set(source.word, record);

	for (const form of source.forms ?? []) {
		if (typeof form.form !== 'string' || !Array.isArray(form.tags)) continue;
		if (!form.tags.some((tag) => ['canonical', 'alternative', 'kanji'].includes(tag))) {
			continue;
		}
		const alias = entries.get(form.form) ?? {
			definitions: [],
			partsOfSpeech: [],
		};
		addUnique(alias.definitions, definitions);
		addUnique(alias.partsOfSpeech, [source.pos_title]);
		entries.set(form.form, alias);
	}
}

const payload = JSON.stringify({
	version: '2026-10-01',
	source: 'Korean Wiktionary via Wiktextract/Kaikki',
	entries: Object.fromEntries([...entries].sort(([a], [b]) => a.localeCompare(b, 'ja'))),
});

await new Promise((resolve, reject) => {
	const output = createWriteStream(outputPath);
	const gzip = createGzip({ level: 9 });
	gzip.on('error', reject);
	output.on('error', reject);
	output.on('finish', resolve);
	gzip.pipe(output);
	gzip.end(payload);
});

console.log(`Wrote ${entries.size.toLocaleString()} Korean dictionary terms to ${outputPath}`);
