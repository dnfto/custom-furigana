export interface LocalDictionaryEntry {
	id: string;
	kanji: Array<{ common: boolean; text: string; tags?: string[] }>;
	kana: Array<{
		common: boolean;
		text: string;
		tags?: string[];
		appliesToKanji: string[];
	}>;
	sense: Array<{
		partOfSpeech: string[];
		appliesToKanji?: string[];
		appliesToKana?: string[];
		gloss: Array<{ lang: string; text: string }>;
	}>;
}

export type DictionaryWorkerMessage =
	| { type: 'needs-build' }
	| { type: 'building' }
	| { type: 'progress'; done: number; total: number }
	| { type: 'ready' }
	| { type: 'result'; requestId: number; entries: LocalDictionaryEntry[] }
	| { type: 'error'; requestId?: number; message: string };
