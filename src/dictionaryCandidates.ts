export interface DictionaryCandidate {
	word: string;
	reading: string;
	definitions: string[];
	partsOfSpeech: string[];
	definitionLanguage: 'ko' | 'en';
	isCommon: boolean;
	jlpt: string[];
}

const INVISIBLE_DICTIONARY_TEXT =
	/[\u00ad\u034f\u061c\u115f\u1160\u17b4\u17b5\u180b-\u180f\u200b-\u200f\u202a-\u202e\u2060-\u206f\u3164\ufe00-\ufe0f\ufeff\uffa0]|\uDB40[\uDD00-\uDDEF]/gu;

function normalizeDictionaryText(value: string): string {
	return value
		.normalize('NFKC')
		.replace(INVISIBLE_DICTIONARY_TEXT, '')
		.replace(/\s+/gu, ' ')
		.trim();
}

function katakanaToHiragana(value: string): string {
	return value.replace(/[ァ-ヶ]/g, (char) =>
		String.fromCharCode(char.charCodeAt(0) - 0x60),
	);
}

export function normalizeKana(value: string): string {
	return katakanaToHiragana(normalizeDictionaryText(value)).replace(/\s+/gu, '');
}

export function uniqueDictionaryStrings(values: string[]): string[] {
	const unique = new Map<string, string>();
	for (const value of values) {
		const key = normalizeDictionaryText(value);
		if (key && !unique.has(key)) unique.set(key, value.trim());
	}
	return [...unique.values()];
}

function dictionaryCandidateKey(
	candidate: Pick<DictionaryCandidate, 'word' | 'reading'>,
): string {
	return `${normalizeDictionaryText(candidate.word)}\u0000${normalizeKana(
		candidate.reading,
	)}`;
}

export function deduplicateDictionaryCandidates(
	candidates: DictionaryCandidate[],
): DictionaryCandidate[] {
	const unique = new Map<string, DictionaryCandidate>();
	for (const candidate of candidates) {
		const key = dictionaryCandidateKey(candidate);
		const existing = unique.get(key);
		if (!existing) {
			unique.set(key, {
				...candidate,
				definitions: uniqueDictionaryStrings(candidate.definitions),
				partsOfSpeech: uniqueDictionaryStrings(candidate.partsOfSpeech),
				jlpt: uniqueDictionaryStrings(candidate.jlpt),
			});
			continue;
		}

		if (
			existing.definitionLanguage === 'en' &&
			candidate.definitionLanguage === 'ko'
		) {
			existing.definitions = uniqueDictionaryStrings(candidate.definitions);
			existing.partsOfSpeech = uniqueDictionaryStrings(candidate.partsOfSpeech);
			existing.definitionLanguage = 'ko';
		} else if (existing.definitionLanguage === candidate.definitionLanguage) {
			existing.definitions = uniqueDictionaryStrings([
				...existing.definitions,
				...candidate.definitions,
			]);
			existing.partsOfSpeech = uniqueDictionaryStrings([
				...existing.partsOfSpeech,
				...candidate.partsOfSpeech,
			]);
		}
		existing.jlpt = uniqueDictionaryStrings([...existing.jlpt, ...candidate.jlpt]);
		existing.isCommon ||= candidate.isCommon;
	}
	return [...unique.values()];
}
