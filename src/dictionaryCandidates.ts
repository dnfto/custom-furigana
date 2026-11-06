export interface DictionaryCandidate {
	word: string;
	reading: string;
	definitions: string[];
	partsOfSpeech: string[];
	definitionLanguage: 'ko' | 'en';
	isCommon: boolean;
	jlpt: string[];
}

const INVISIBLE_CODE_POINTS = new Set([
	0x00ad, 0x034f, 0x061c, 0x115f, 0x1160, 0x17b4, 0x17b5, 0x3164,
	0xfeff, 0xffa0,
]);

function isInvisibleDictionaryCodePoint(codePoint: number): boolean {
	return (
		INVISIBLE_CODE_POINTS.has(codePoint) ||
		(codePoint >= 0x180b && codePoint <= 0x180f) ||
		(codePoint >= 0x200b && codePoint <= 0x200f) ||
		(codePoint >= 0x202a && codePoint <= 0x202e) ||
		(codePoint >= 0x2060 && codePoint <= 0x206f) ||
		(codePoint >= 0xfe00 && codePoint <= 0xfe0f) ||
		(codePoint >= 0xe0100 && codePoint <= 0xe01ef)
	);
}

function stripInvisibleDictionaryText(value: string): string {
	return [...value]
		.filter((character) => {
			const codePoint = character.codePointAt(0);
			return codePoint === undefined || !isInvisibleDictionaryCodePoint(codePoint);
		})
		.join('');
}

function normalizeDictionaryText(value: string): string {
	return stripInvisibleDictionaryText(value.normalize('NFKC'))
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
