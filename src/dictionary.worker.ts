import {
	type DictionaryWorkerMessage,
	type LocalDictionaryEntry,
} from './dictionaryTypes';

interface BuildMessage {
	type: 'build';
	binaryData: ArrayBuffer;
	version: string;
}

interface InitMessage {
	type: 'init';
	version: string;
}

interface LookupMessage {
	type: 'lookup';
	requestId: number;
	query: string;
}

type IncomingMessage = BuildMessage | InitMessage | LookupMessage;

const DB_NAME = 'custom-furigana-jmdict';
const DB_VERSION = 1;
const ENTRIES = 'entries';
const TERMS = 'terms';
const META = 'meta';

let database: IDBDatabase | null = null;

function send(message: DictionaryWorkerMessage): void {
	postMessage(message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function isLocalDictionaryEntry(value: unknown): value is LocalDictionaryEntry {
	return (
		isRecord(value) &&
		typeof value.id === 'string' &&
		Array.isArray(value.kanji) &&
		Array.isArray(value.kana) &&
		Array.isArray(value.sense)
	);
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
	return new Promise((resolve, reject) => {
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
	});
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
	return new Promise((resolve, reject) => {
		transaction.oncomplete = () => resolve();
		transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed'));
		transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted'));
	});
}

async function openDatabase(): Promise<IDBDatabase> {
	if (database) return database;
	const request = indexedDB.open(DB_NAME, DB_VERSION);
	request.onupgradeneeded = () => {
		const db = request.result;
		if (!db.objectStoreNames.contains(ENTRIES)) db.createObjectStore(ENTRIES, { keyPath: 'id' });
		if (!db.objectStoreNames.contains(TERMS)) db.createObjectStore(TERMS);
		if (!db.objectStoreNames.contains(META)) db.createObjectStore(META);
	};
	database = await requestResult(request);
	return database;
}

async function readMetaVersion(db: IDBDatabase): Promise<string | undefined> {
	const transaction = db.transaction(META, 'readonly');
	const value = await requestResult<unknown>(
		transaction.objectStore(META).get('dictionary-version'),
	);
	return typeof value === 'string' ? value : undefined;
}

async function initialize(expectedVersion: string): Promise<void> {
	const db = await openDatabase();
	const transaction = db.transaction(ENTRIES, 'readonly');
	const count = await requestResult(transaction.objectStore(ENTRIES).count());
	const storedVersion = await readMetaVersion(db);
	send({
		type: count > 0 && storedVersion === expectedVersion ? 'ready' : 'needs-build',
	});
}

async function decompressDictionary(
	binaryData: ArrayBuffer,
): Promise<LocalDictionaryEntry[]> {
	const stream = new Response(binaryData).body;
	if (!stream) throw new Error('Could not read dictionary data');
	const decompressed = stream.pipeThrough(new DecompressionStream('gzip'));
	const payload = JSON.parse(await new Response(decompressed).text()) as unknown;
	if (!isRecord(payload) || !Array.isArray(payload.words)) {
		throw new Error('Invalid dictionary data');
	}
	if (!payload.words.every(isLocalDictionaryEntry)) {
		throw new Error('Invalid dictionary entry');
	}
	return payload.words;
}

async function buildDictionary(binaryData: ArrayBuffer, version: string): Promise<void> {
	send({ type: 'building' });
	const words = await decompressDictionary(binaryData);
	const termIndex = new Map<string, string[]>();

	for (let index = 0; index < words.length; index += 1) {
		const entry = words[index];
		const terms = [
			...(Array.isArray(entry.kanji) ? entry.kanji : []),
			...(Array.isArray(entry.kana) ? entry.kana : []),
		];
		for (const term of terms) {
			if (typeof term.text !== 'string' || !term.text) continue;
			const ids = termIndex.get(term.text) ?? [];
			ids.push(entry.id);
			termIndex.set(term.text, ids);
		}
		if (index > 0 && index % 50000 === 0) {
			send({ type: 'progress', done: index, total: words.length });
		}
	}

	const db = await openDatabase();
	const transaction = db.transaction([ENTRIES, TERMS, META], 'readwrite');
	const entriesStore = transaction.objectStore(ENTRIES);
	const termsStore = transaction.objectStore(TERMS);
	entriesStore.clear();
	termsStore.clear();

	for (const entry of words) entriesStore.put(entry);
	for (const [term, ids] of termIndex) termsStore.put(ids, term);
	transaction.objectStore(META).put(version, 'dictionary-version');
	await transactionDone(transaction);
	send({ type: 'ready' });
}

async function lookup(requestId: number, query: string): Promise<void> {
	const db = await openDatabase();
	const transaction = db.transaction([TERMS, ENTRIES], 'readonly');
	const ids =
		(await requestResult<string[] | undefined>(transaction.objectStore(TERMS).get(query))) ?? [];
	const entriesStore = transaction.objectStore(ENTRIES);
	const entries = (await Promise.all(
		ids.map((id) =>
			requestResult<LocalDictionaryEntry | undefined>(entriesStore.get(id)),
		),
	)).filter((entry): entry is LocalDictionaryEntry => entry !== undefined);
	send({ type: 'result', requestId, entries });
}

self.onmessage = (event: MessageEvent<IncomingMessage>) => {
	const message = event.data;
	void (async () => {
		try {
			switch (message.type) {
				case 'init':
					await initialize(message.version);
					break;
				case 'build':
					await buildDictionary(message.binaryData, message.version);
					break;
				case 'lookup':
					await lookup(message.requestId, message.query);
					break;
			}
		} catch (error) {
			send({
				type: 'error',
				requestId: message.type === 'lookup' ? message.requestId : undefined,
				message: error instanceof Error ? error.message : String(error),
			});
		}
	})();
};
