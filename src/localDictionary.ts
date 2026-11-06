import { TokenizerBuilder } from '@patdx/kuromoji';
import { Platform, type Plugin } from 'obsidian';

import DictionaryWorker from 'dictionary.worker';
import {
	type DictionaryWorkerMessage,
	type LocalDictionaryEntry,
} from './dictionaryTypes';
import { ensureDataFile } from './remoteData';

export type { LocalDictionaryEntry } from './dictionaryTypes';

export type DictionaryStatus =
	| 'idle'
	| 'downloading'
	| 'loading-tokenizer'
	| 'building-index'
	| 'ready'
	| 'error';

interface LookupResult {
	entries: LocalDictionaryEntry[];
	matchedQuery: string;
}

const DICTIONARY_VERSION = '3.6.2';
const JMDICT_FILE = 'jmdict-eng-3.6.2.json.gz';
const KOREAN_DICTIONARY_FILE = 'wiktionary-ja-ko-2026-10-01.json.gz';
const MOBILE_SHARD_COUNT = 64;
const MOBILE_FILE_RETRY_DELAY_MS = 750;
const DATA_FILES = [
	JMDICT_FILE,
	'base.dat.gz',
	'cc.dat.gz',
	'check.dat.gz',
	'tid.dat.gz',
	'tid_map.dat.gz',
	'tid_pos.dat.gz',
	'unk.dat.gz',
	'unk_char.dat.gz',
	'unk_compat.dat.gz',
	'unk_invoke.dat.gz',
	'unk_map.dat.gz',
	'unk_pos.dat.gz',
];
function decompressedArrayBuffer(binaryData: ArrayBuffer): Promise<ArrayBuffer> {
	const stream = new Response(binaryData).body;
	if (!stream) throw new Error('Could not read compressed dictionary file');
	return new Response(stream.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
}

function delay(milliseconds: number): Promise<void> {
	return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function isFileSystemTimeout(error: unknown): boolean {
	const message = error instanceof Error ? error.message : String(error);
	return /file system operation timed out/i.test(message);
}

class VaultDictionaryLoader {
	constructor(
		private readonly plugin: Plugin,
		private readonly dataFolder: string,
	) {}

	async loadArrayBuffer(file: string): Promise<ArrayBuffer> {
		const binaryData = await this.plugin.app.vault.adapter.readBinary(
			`${this.dataFolder}/${file}`,
		);
		return decompressedArrayBuffer(binaryData);
	}
}

export class LocalDictionary {
	status: DictionaryStatus = 'idle';
	lastError = '';
	readonly isMobileMode = Platform.isMobileApp;

	private worker: Worker | null = null;
	private tokenizer: Awaited<ReturnType<InstanceType<typeof TokenizerBuilder>['build']>> | null = null;
	private koreanDictionary: Record<
		string,
		{ definitions: string[]; partsOfSpeech: string[] }
	> = {};
	private readonly mobileShardCache = new Map<
		number,
		Record<string, LocalDictionaryEntry[]>
	>();
	private nextRequestId = 1;
	private readonly pending = new Map<
		number,
		{
			resolve: (result: LocalDictionaryEntry[]) => void;
			reject: (error: Error) => void;
		}
	>();
	private readyResolver: (() => void) | null = null;
	private readonly readyPromise = new Promise<void>((resolve) => {
		this.readyResolver = resolve;
	});

	constructor(
		private readonly plugin: Plugin,
		private readonly onStatusChange: (status: DictionaryStatus) => void,
	) {}

	get dataFolder(): string {
		return `${this.plugin.manifest.dir}/dict`;
	}

	async initialize(): Promise<void> {
		try {
			if (this.isMobileMode) {
				this.setStatus('ready');
				void this.loadOptionalKoreanDictionary();
				return;
			}
			await this.ensureDataFiles();
			this.setStatus('loading-tokenizer');
			const tokenizerPromise = new TokenizerBuilder({
				loader: new VaultDictionaryLoader(this.plugin, this.dataFolder),
			}).build();
			const koreanDictionaryPromise = this.loadOptionalKoreanDictionary();

			const worker = new DictionaryWorker();
			this.worker = worker;
			worker.onmessage = (event: MessageEvent<DictionaryWorkerMessage>) =>
				void this.handleWorkerMessage(event.data);
			worker.onerror = (event) => this.fail(new Error(event.message));
			worker.postMessage({ type: 'init', version: DICTIONARY_VERSION });

			[this.tokenizer] = await Promise.all([
				tokenizerPromise,
				this.readyPromise,
				koreanDictionaryPromise,
			]);
			this.setStatus('ready');
		} catch (error) {
			this.fail(error instanceof Error ? error : new Error(String(error)));
		}
	}

	destroy(): void {
		this.worker?.terminate();
		this.worker = null;
		for (const pending of this.pending.values()) {
			pending.reject(new Error('Dictionary stopped'));
		}
		this.pending.clear();
	}

	async lookup(query: string): Promise<LookupResult> {
		if (this.isMobileMode) {
			if (this.status !== 'ready') {
				throw new Error(`Dictionary is not ready (${this.status})`);
			}
			return {
				entries: await this.mobileLookup(query),
				matchedQuery: query,
			};
		}
		if (this.status !== 'ready' || !this.worker) {
			throw new Error(`Dictionary is not ready (${this.status})`);
		}

		let entries = await this.workerLookup(query);
		if (entries.length > 0) return { entries, matchedQuery: query };

		const baseForm = this.getBaseForm(query);
		if (baseForm && baseForm !== query) {
			entries = await this.workerLookup(baseForm);
			if (entries.length > 0) return { entries, matchedQuery: baseForm };
		}

		return { entries: [], matchedQuery: query };
	}

	lookupKorean(term: string): {
		definitions: string[];
		partsOfSpeech: string[];
	} | null {
		const record = this.koreanDictionary[term];
		if (!record || record.definitions.length === 0) return null;
		return {
			definitions: [...record.definitions],
			partsOfSpeech: [...record.partsOfSpeech],
		};
	}

	private async ensureDataFiles(): Promise<void> {
		for (const file of DATA_FILES) {
			if (!(await this.plugin.app.vault.adapter.exists(`${this.dataFolder}/${file}`))) {
				this.setStatus('downloading');
			}
			await ensureDataFile(this.plugin, file);
		}
	}

	private async loadKoreanDictionary(): Promise<void> {
		await ensureDataFile(this.plugin, KOREAN_DICTIONARY_FILE);
		const path = `${this.dataFolder}/${KOREAN_DICTIONARY_FILE}`;
		const binaryData = await this.readBinaryWithMobileRetry(path);
		const decompressed = await decompressedArrayBuffer(binaryData);
		const payload = JSON.parse(new TextDecoder().decode(decompressed)) as {
			entries?: Record<
				string,
				{ definitions: string[]; partsOfSpeech: string[] }
			>;
		};
		this.koreanDictionary = payload.entries ?? {};
	}

	private async loadOptionalKoreanDictionary(): Promise<void> {
		try {
			await this.loadKoreanDictionary();
		} catch (error) {
			console.warn(
				'Custom Furigana Korean dictionary is temporarily unavailable; continuing with English definitions',
				error,
			);
		}
	}

	private async readBinaryWithMobileRetry(path: string): Promise<ArrayBuffer> {
		try {
			return await this.plugin.app.vault.adapter.readBinary(path);
		} catch (error) {
			if (!this.isMobileMode || !isFileSystemTimeout(error)) throw error;
			await delay(MOBILE_FILE_RETRY_DELAY_MS);
			return this.plugin.app.vault.adapter.readBinary(path);
		}
	}

	private mobileShardIndex(term: string): number {
		let hash = 0x811c9dc5;
		for (let index = 0; index < term.length; index += 1) {
			hash ^= term.charCodeAt(index);
			hash = Math.imul(hash, 0x01000193);
		}
		return (hash >>> 0) % MOBILE_SHARD_COUNT;
	}

	private async mobileLookup(query: string): Promise<LocalDictionaryEntry[]> {
		const shardIndex = this.mobileShardIndex(query);
		let shard = this.mobileShardCache.get(shardIndex);
		if (!shard) {
			const filename = `jmdict-${String(shardIndex).padStart(2, '0')}.json.gz`;
			await ensureDataFile(this.plugin, `mobile/${filename}`);
			const binaryData = await this.readBinaryWithMobileRetry(
				`${this.dataFolder}/mobile/${filename}`,
			);
			const decompressed = await decompressedArrayBuffer(binaryData);
			const payload = JSON.parse(new TextDecoder().decode(decompressed)) as {
				entries?: Record<string, LocalDictionaryEntry[]>;
			};
			shard = payload.entries ?? {};
			this.mobileShardCache.set(shardIndex, shard);
			while (this.mobileShardCache.size > 1) {
				const oldest = this.mobileShardCache.keys().next();
				if (oldest.done) break;
				this.mobileShardCache.delete(oldest.value);
			}
		}
		return shard[query] ?? [];
	}

	private async handleWorkerMessage(message: DictionaryWorkerMessage): Promise<void> {
		switch (message.type) {
			case 'needs-build': {
				this.setStatus('building-index');
				const binaryData = await this.plugin.app.vault.adapter.readBinary(
					`${this.dataFolder}/${JMDICT_FILE}`,
				);
				this.worker?.postMessage(
					{ type: 'build', binaryData, version: DICTIONARY_VERSION },
					[binaryData],
				);
				break;
			}
			case 'building':
			case 'progress':
				this.setStatus('building-index');
				break;
			case 'ready':
				this.readyResolver?.();
				this.readyResolver = null;
				break;
			case 'result': {
				const pending = this.pending.get(message.requestId);
				if (!pending) break;
				this.pending.delete(message.requestId);
				pending.resolve(message.entries);
				break;
			}
			case 'error': {
				if (typeof message.requestId === 'number') {
					const pending = this.pending.get(message.requestId);
					this.pending.delete(message.requestId);
					pending?.reject(new Error(message.message));
				} else {
					this.fail(new Error(message.message));
				}
				break;
			}
		}
	}

	private workerLookup(query: string): Promise<LocalDictionaryEntry[]> {
		const worker = this.worker;
		if (!worker) return Promise.reject(new Error('Dictionary worker is unavailable'));
		const requestId = this.nextRequestId++;
		return new Promise((resolve, reject) => {
			this.pending.set(requestId, { resolve, reject });
			worker.postMessage({ type: 'lookup', requestId, query });
		});
	}

	private getBaseForm(query: string): string | null {
		if (!this.tokenizer) return null;
		const tokens = this.tokenizer.tokenize(query);
		for (const token of tokens) {
			const baseForm = token.basic_form;
			if (baseForm && baseForm !== '*' && baseForm !== token.surface_form) return baseForm;
		}
		return null;
	}

	private setStatus(status: DictionaryStatus): void {
		if (this.status === status) return;
		this.status = status;
		this.onStatusChange(status);
	}

	private fail(error: Error): void {
		this.lastError = error.message;
		this.setStatus('error');
		console.error('Custom Furigana local dictionary error', error);
	}
}
