import { Platform, type Plugin } from 'obsidian';

import { normalizeKana } from './dictionaryCandidates';
import { jlptLevelForText, type JlptLevel } from './jlptLevels';
import { ensureDataFile } from './remoteData';

export interface AutoRubyMatch {
	start: number;
	end: number;
	base: string;
	reading: string;
	jlptLevel: JlptLevel;
}

interface AutoReadingShard {
	maxLength: number;
	entries: Record<string, string>;
}

interface TextSegment {
	segment: string;
	index: number;
}

const AUTO_SHARD_COUNT = 64;
const MOBILE_CACHE_LIMIT = 12;
const DESKTOP_CACHE_LIMIT = 32;
const FILE_RETRY_DELAY_MS = 750;
const HAS_KANJI = /\p{Script=Han}/u;
const KANJI_RUN = /[\p{Script=Han}々〆ヶ]+/gu;
const JAPANESE_RUN =
	/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}々〆ヶー]+/gu;

function delay(milliseconds: number): Promise<void> {
	return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function isFileSystemTimeout(error: unknown): boolean {
	const message = error instanceof Error ? error.message : String(error);
	return /file system operation timed out/i.test(message);
}

async function decompress(binaryData: ArrayBuffer): Promise<ArrayBuffer> {
	const stream = new Response(binaryData).body;
	if (!stream) throw new Error('Could not read automatic-reading data');
	return new Response(stream.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
}

function shardIndex(value: string): number {
	const firstCharacter = [...value][0] ?? '';
	let hash = 0x811c9dc5;
	for (let index = 0; index < firstCharacter.length; index += 1) {
		hash ^= firstCharacter.charCodeAt(index);
		hash = Math.imul(hash, 0x01000193);
	}
	return (hash >>> 0) % AUTO_SHARD_COUNT;
}

function fallbackSegments(text: string): TextSegment[] {
	const segments: TextSegment[] = [];
	JAPANESE_RUN.lastIndex = 0;
	let match: RegExpExecArray | null;
	while ((match = JAPANESE_RUN.exec(text)) !== null) {
		segments.push({ segment: match[0], index: match.index });
	}
	return segments;
}

export function alignAutomaticReading(
	surface: string,
	reading: string,
	offset = 0,
): AutoRubyMatch[] {
	const blocks = [...surface.matchAll(KANJI_RUN)];
	if (blocks.length === 0) return [];

	const normalizedReading = normalizeKana(reading);
	let readingCursor = 0;
	const leadingKana = normalizeKana(surface.slice(0, blocks[0].index ?? 0));
	if (leadingKana) {
		if (!normalizedReading.startsWith(leadingKana)) return [];
		readingCursor = leadingKana.length;
	}

	const matches: AutoRubyMatch[] = [];
	for (let index = 0; index < blocks.length; index += 1) {
		const block = blocks[index];
		const blockStart = block.index ?? 0;
		const blockEnd = blockStart + block[0].length;
		const nextBlockStart = blocks[index + 1]?.index ?? surface.length;
		const kanaAnchor = normalizeKana(surface.slice(blockEnd, nextBlockStart));
		let readingEnd = normalizedReading.length;

		if (kanaAnchor) {
			const anchorIndex = normalizedReading.indexOf(kanaAnchor, readingCursor);
			if (anchorIndex < readingCursor) return [];
			readingEnd = anchorIndex;
		}

		const blockReading = normalizedReading.slice(readingCursor, readingEnd);
		if (!blockReading) return [];
		matches.push({
			start: offset + blockStart,
			end: offset + blockEnd,
			base: block[0],
			reading: blockReading,
			jlptLevel: jlptLevelForText(block[0]),
		});
		readingCursor = readingEnd + kanaAnchor.length;
	}

	return readingCursor === normalizedReading.length ? matches : [];
}

function contextualReading(
	surface: string,
	reading: string,
	followingText: string,
): string | null {
	if (surface !== '来') return reading;

	const followingKana = normalizeKana(followingText);
	if (/^(?:た|て|ま)/u.test(followingKana)) return 'き';
	if (/^(?:な|さ|よ)/u.test(followingKana)) return 'こ';
	if (/^れ/u.test(followingKana)) return 'く';
	return null;
}

export class AutoFuriganaEngine {
	private readonly cache = new Map<number, AutoReadingShard>();
	private readonly pending = new Map<number, Promise<AutoReadingShard>>();

	constructor(private readonly plugin: Plugin) {}

	async annotateText(text: string, offset = 0): Promise<AutoRubyMatch[]> {
		const matches: AutoRubyMatch[] = [];
		for (const segment of this.getSegments(text)) {
			if (!HAS_KANJI.test(segment.segment)) continue;
			matches.push(
				...(await this.annotateSegment(
					segment.segment,
					offset + segment.index,
				)),
			);
		}
		return matches;
	}

	clear(): void {
		this.cache.clear();
		this.pending.clear();
	}

	private getSegments(text: string): TextSegment[] {
		return fallbackSegments(text);
	}

	private async annotateSegment(
		segment: string,
		absoluteStart: number,
	): Promise<AutoRubyMatch[]> {
		const matches: AutoRubyMatch[] = [];
		let cursor = 0;
		while (cursor < segment.length) {
			const remaining = segment.slice(cursor);
			const found = await this.lookupLongestPrefix(remaining);
			if (found) {
				const [base, reading] = found;
				const resolvedReading = contextualReading(
					base,
					reading,
					remaining.slice(base.length),
				);
				if (resolvedReading) {
					matches.push(
						...alignAutomaticReading(
							base,
							resolvedReading,
							absoluteStart + cursor,
						),
					);
				}
				cursor += base.length;
				continue;
			}
			cursor += [...remaining][0]?.length ?? 1;
		}
		return matches;
	}

	private async lookupLongestPrefix(value: string): Promise<[string, string] | null> {
		if (!value) return null;
		const shard = await this.loadShard(shardIndex(value));
		const characters = [...value].slice(0, shard.maxLength);
		for (let length = characters.length; length > 0; length -= 1) {
			const surface = characters.slice(0, length).join('');
			const reading = shard.entries[surface];
			if (reading && HAS_KANJI.test(surface)) return [surface, reading];
		}
		return null;
	}

	private async loadShard(index: number): Promise<AutoReadingShard> {
		const cached = this.cache.get(index);
		if (cached) {
			this.cache.delete(index);
			this.cache.set(index, cached);
			return cached;
		}
		const inFlight = this.pending.get(index);
		if (inFlight) return inFlight;

		const promise = this.readShard(index);
		this.pending.set(index, promise);
		try {
			const shard = await promise;
			this.cache.set(index, shard);
			const limit = Platform.isMobileApp ? MOBILE_CACHE_LIMIT : DESKTOP_CACHE_LIMIT;
			while (this.cache.size > limit) {
				const oldest = this.cache.keys().next();
				if (oldest.done) break;
				this.cache.delete(oldest.value);
			}
			return shard;
		} finally {
			this.pending.delete(index);
		}
	}

	private async readShard(index: number): Promise<AutoReadingShard> {
		const relativePath = `auto/auto-${String(index).padStart(2, '0')}.json.gz`;
		await ensureDataFile(this.plugin, relativePath);
		const path = `${this.plugin.manifest.dir}/dict/${relativePath}`;
		let binaryData: ArrayBuffer;
		try {
			binaryData = await this.plugin.app.vault.adapter.readBinary(path);
		} catch (error) {
			if (!Platform.isMobileApp || !isFileSystemTimeout(error)) throw error;
			await delay(FILE_RETRY_DELAY_MS);
			binaryData = await this.plugin.app.vault.adapter.readBinary(path);
		}
		const decompressed = await decompress(binaryData);
		return JSON.parse(new TextDecoder().decode(decompressed)) as AutoReadingShard;
	}
}
