import { Platform, type Plugin } from 'obsidian';

import { normalizeKana } from './dictionaryCandidates';
import {
	jlptLevelForText,
	jlptReadingForText,
	MAX_JLPT_VOCABULARY_LENGTH,
	type JlptLevel,
} from './jlptLevels';
import { ensureDataFile } from './remoteData';

export interface AutoRubyMatch {
	start: number;
	end: number;
	base: string;
	reading: string;
	jlptLevel: JlptLevel;
}

/**
 * How much of a matched word carries the ruby:
 * - kanji: kanji only, okurigana left outside (the existing design,
 *   煙り → 煙(けむ)り)
 * - word: the whole matched surface, so the reading is complete
 *   (煙り → 煙り(けむり))
 */
export type RubyScope = 'kanji' | 'word';

interface AutoReadingShard {
	maxLength: number;
	entries: Record<string, string>;
}

interface TextSegment {
	segment: string;
	index: number;
}

interface KanjiBlock {
	text: string;
	start: number;
	end: number;
	/** Kana that follows this kanji block (for the last block: the okurigana) */
	anchorAfter: string;
}

const AUTO_SHARD_COUNT = 64;
const MOBILE_CACHE_LIMIT = 12;
const DESKTOP_CACHE_LIMIT = 32;
const MOBILE_TEXT_CACHE_LIMIT = 160;
const DESKTOP_TEXT_CACHE_LIMIT = 512;
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
	// Local regex: concurrent calls must not share a `lastIndex`
	const pattern = new RegExp(JAPANESE_RUN.source, 'gu');
	let match: RegExpExecArray | null;
	while ((match = pattern.exec(text)) !== null) {
		segments.push({ segment: match[0], index: match.index });
	}
	return segments;
}

function kanjiBlocks(surface: string): KanjiBlock[] {
	const runs = [...surface.matchAll(new RegExp(KANJI_RUN.source, 'gu'))].map(
		(match) => ({
			text: match[0],
			start: match.index ?? 0,
			end: (match.index ?? 0) + match[0].length,
		}),
	);
	return runs.map((run, index) => ({
		...run,
		anchorAfter: normalizeKana(
			surface.slice(run.end, runs[index + 1]?.start ?? surface.length),
		),
	}));
}

/**
 * Split "surface + full reading" into one reading per kanji block.
 *
 * The previous version located the okurigana anchor with a forward `indexOf`,
 * which breaks as soon as the kana also starts the kanji's own reading:
 * 勢い / いきおい matched on the leading い, produced an empty block reading
 * and the whole word was dropped. This version:
 * 1. matches the trailing okurigana from the end of the reading (endsWith),
 *    so 勢い becomes いきお + い;
 * 2. backtracks over internal kana anchors, so every kanji block keeps at
 *    least one kana and the remaining reading still covers the rest.
 *
 * Returns null when no split exists; the caller then falls back to a
 * whole-word match instead of silently dropping the word.
 */
function splitBlockReadings(
	surface: string,
	normalizedReading: string,
): string[] | null {
	const blocks = kanjiBlocks(surface);
	if (blocks.length === 0) return null;

	const leadingKana = normalizeKana(surface.slice(0, blocks[0].start));
	let cursor = 0;
	if (leadingKana) {
		if (!normalizedReading.startsWith(leadingKana)) return null;
		cursor = leadingKana.length;
	}

	const readings: string[] = [];

	const search = (index: number, readingCursor: number): boolean => {
		const block = blocks[index];
		const isLast = index === blocks.length - 1;

		if (isLast) {
			const anchor = block.anchorAfter;
			if (anchor) {
				if (!normalizedReading.endsWith(anchor)) return false;
				const end = normalizedReading.length - anchor.length;
				if (end <= readingCursor) return false;
				readings[index] = normalizedReading.slice(readingCursor, end);
				return true;
			}
			if (normalizedReading.length <= readingCursor) return false;
			readings[index] = normalizedReading.slice(readingCursor);
			return true;
		}

		const anchor = block.anchorAfter;
		if (!anchor) return false;

		for (
			let at = normalizedReading.indexOf(anchor, readingCursor + 1);
			at >= readingCursor + 1;
			at = normalizedReading.indexOf(anchor, at + 1)
		) {
			// Every remaining kanji block needs at least one kana
			if (normalizedReading.length - (at + anchor.length) < blocks.length - index - 1) {
				continue;
			}
			readings[index] = normalizedReading.slice(readingCursor, at);
			if (search(index + 1, at + anchor.length)) return true;
		}
		return false;
	};

	if (!search(0, cursor)) return null;
	return readings;
}

export function alignAutomaticReading(
	surface: string,
	reading: string,
	offset = 0,
): AutoRubyMatch[] {
	const blocks = kanjiBlocks(surface);
	if (blocks.length === 0) return [];

	const normalizedReading = normalizeKana(reading);
	if (!normalizedReading) return [];
	const readings = splitBlockReadings(surface, normalizedReading);
	if (!readings) return [];

	const jlptLevel = jlptLevelForText(surface);
	return blocks.map((block, index) => ({
		start: offset + block.start,
		end: offset + block.end,
		base: block.text,
		reading: readings[index],
		jlptLevel,
	}));
}

/**
 * Decide which ranges of a matched word carry the ruby.
 * When the kanji split fails this degrades to a whole-word match, the same
 * fallback the authored `{漢字|よみ}` path uses, so a word found in the
 * dictionary never disappears just because it cannot be split.
 */
export function planRubyRanges(
	surface: string,
	reading: string,
	offset = 0,
	scope: RubyScope = 'kanji',
): AutoRubyMatch[] {
	const normalizedReading = normalizeKana(reading);
	if (!surface || !normalizedReading) return [];

	if (scope === 'kanji') {
		const aligned = alignAutomaticReading(surface, normalizedReading, offset);
		if (aligned.length > 0) return aligned;
	}

	return [
		{
			start: offset,
			end: offset + surface.length,
			base: surface,
			reading: normalizedReading,
			jlptLevel: jlptLevelForText(surface),
		},
	];
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

export function mergeCompoundAutomaticMatches(
	matches: AutoRubyMatch[],
): AutoRubyMatch[] {
	const sorted = [...matches].sort((left, right) => left.start - right.start);
	const merged: AutoRubyMatch[] = [];

	for (let index = 0; index < sorted.length; index += 1) {
		const first = sorted[index];
		let surface = first.base;
		let best:
			| { endIndex: number; surface: string; reading: string; level: JlptLevel }
			| undefined;

		for (let endIndex = index + 1; endIndex < sorted.length; endIndex += 1) {
			const previous = sorted[endIndex - 1];
			const next = sorted[endIndex];
			if (previous.end !== next.start) break;
			surface += next.base;
			const reading = jlptReadingForText(surface);
			if (!reading) continue;
			best = {
				endIndex,
				surface,
				reading,
				level: jlptLevelForText(surface),
			};
		}

		if (!best) {
			merged.push(first);
			continue;
		}

		merged.push({
			start: first.start,
			end: sorted[best.endIndex].end,
			base: best.surface,
			reading: best.reading,
			jlptLevel: best.level,
		});
		index = best.endIndex;
	}

	return merged;
}

export class AutoFuriganaEngine {
	/** Written by the plugin from settings: kanji-only or whole-word ruby */
	scope: RubyScope = 'kanji';

	private readonly cache = new Map<number, AutoReadingShard>();
	private readonly pending = new Map<number, Promise<AutoReadingShard>>();
	private readonly textCache = new Map<string, AutoRubyMatch[]>();

	constructor(private readonly plugin: Plugin) {}

	async annotateText(text: string, offset = 0): Promise<AutoRubyMatch[]> {
		if (!text || !HAS_KANJI.test(text)) return [];
		const cacheKey = `${this.scope}\u0000${text}`;
		const cached = this.textCache.get(cacheKey);
		if (cached) {
			this.textCache.delete(cacheKey);
			this.textCache.set(cacheKey, cached);
			return offset === 0
				? cached
				: cached.map((match) => ({
						...match,
						start: match.start + offset,
						end: match.end + offset,
					}));
		}

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
		const result = mergeCompoundAutomaticMatches(matches);
		this.rememberText(cacheKey, result, offset);
		return result;
	}

	clear(): void {
		this.cache.clear();
		this.pending.clear();
		this.textCache.clear();
	}

	private rememberText(
		cacheKey: string,
		matches: AutoRubyMatch[],
		offset: number,
	): void {
		// Cache relative positions and shift them by `offset` on a hit
		const relative =
			offset === 0
				? matches
				: matches.map((match) => ({
						...match,
						start: match.start - offset,
						end: match.end - offset,
					}));
		this.textCache.set(cacheKey, relative);
		const limit = Platform.isMobileApp
			? MOBILE_TEXT_CACHE_LIMIT
			: DESKTOP_TEXT_CACHE_LIMIT;
		while (this.textCache.size > limit) {
			const oldest = this.textCache.keys().next();
			if (oldest.done) break;
			this.textCache.delete(oldest.value);
		}
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
						...planRubyRanges(
							base,
							resolvedReading,
							absoluteStart + cursor,
							this.scope,
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
		const vocabularyCharacters = [...value].slice(
			0,
			MAX_JLPT_VOCABULARY_LENGTH,
		);
		// Multi-character JLPT words win (best quality); single characters are
		// handled by the shard lookup below, see the note there
		for (let length = vocabularyCharacters.length; length > 1; length -= 1) {
			const surface = vocabularyCharacters.slice(0, length).join('');
			const reading = jlptReadingForText(surface);
			if (reading && HAS_KANJI.test(surface)) return [surface, reading];
		}

		const shard = await this.loadShard(shardIndex(value));
		const characters = [...value].slice(0, shard.maxLength);
		for (let length = characters.length; length > 0; length -= 1) {
			const surface = characters.slice(0, length).join('');
			const reading = shard.entries[surface];
			if (!reading || !HAS_KANJI.test(surface)) continue;

			// Trust the tokenizer dictionary for single characters, except when the
			// JLPT table has the complete version of the same reading (shard 煙 →
			// けむ, JLPT 煙 → けむり).
			const jlptReading = normalizeKana(jlptReadingForText(surface) ?? '');
			if (jlptReading.length > reading.length && jlptReading.startsWith(reading)) {
				return [surface, jlptReading];
			}
			return [surface, reading];
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
		await ensureDataFile(this.plugin, relativePath, true);
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
