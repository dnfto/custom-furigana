const RENDERED_BLOCK_TAGS = new Set([
	'ADDRESS',
	'ARTICLE',
	'ASIDE',
	'BLOCKQUOTE',
	'DD',
	'DIV',
	'DL',
	'DT',
	'FIELDSET',
	'FIGCAPTION',
	'FIGURE',
	'FOOTER',
	'FORM',
	'H1',
	'H2',
	'H3',
	'H4',
	'H5',
	'H6',
	'HEADER',
	'HGROUP',
	'LI',
	'MAIN',
	'NAV',
	'OL',
	'P',
	'PRE',
	'SECTION',
	'SUMMARY',
	'TABLE',
	'TBODY',
	'TD',
	'TFOOT',
	'TH',
	'THEAD',
	'TR',
	'UL',
]);
const RENDERED_EXCLUDED_TAGS = new Set([
	'CODE',
	'INPUT',
	'KBD',
	'PRE',
	'RT',
	'RUBY',
	'SAMP',
	'SCRIPT',
	'STYLE',
	'TEXTAREA',
]);
const RENDERED_BREAK_TAGS = new Set(['BR', 'HR']);

export interface RenderedTextPart {
	node: Text;
	start: number;
	end: number;
	value: string;
}

function isRenderedBlock(element: HTMLElement): boolean {
	return RENDERED_BLOCK_TAGS.has(element.tagName);
}

function isRenderedExclusion(element: HTMLElement): boolean {
	return (
		RENDERED_EXCLUDED_TAGS.has(element.tagName) ||
		element.classList.contains('math') ||
		element.classList.contains('frontmatter')
	);
}

function closestRenderedBlock(element: HTMLElement): HTMLElement | null {
	let current: HTMLElement | null = element;
	while (current) {
		if (isRenderedBlock(current)) return current;
		current = current.parentElement;
	}
	return null;
}

function renderedScope(root: HTMLElement): HTMLElement {
	return closestRenderedBlock(root) ?? root;
}

export function renderedTextRuns(root: HTMLElement): Text[][] {
	const scope = renderedScope(root);
	const runs: Text[][] = [];
	let current: Text[] = [];

	const flush = (): void => {
		if (current.length > 0) runs.push(current);
		current = [];
	};
	const visitChildren = (parent: Node): void => {
		for (const child of Array.from(parent.childNodes)) visit(child);
	};
	const visit = (node: Node): void => {
		if (node.nodeType === Node.TEXT_NODE) {
			const text = node as Text;
			if (text.nodeValue) current.push(text);
			return;
		}
		if (!(node instanceof HTMLElement)) {
			visitChildren(node);
			return;
		}
		if (isRenderedExclusion(node)) {
			flush();
			return;
		}
		if (RENDERED_BREAK_TAGS.has(node.tagName)) {
			flush();
			return;
		}
		if (node !== scope && isRenderedBlock(node)) {
			flush();
			visitChildren(node);
			flush();
			return;
		}
		visitChildren(node);
	};

	visit(scope);
	flush();
	return runs;
}

export function renderedTextParts(nodes: Text[]): {
	parts: RenderedTextPart[];
	text: string;
} {
	const parts: RenderedTextPart[] = [];
	let text = '';
	for (const node of nodes) {
		const value = node.nodeValue ?? '';
		const start = text.length;
		text += value;
		parts.push({ node, start, end: text.length, value });
	}
	return { parts, text };
}

export function renderedTextPartsAreCurrent(
	parts: RenderedTextPart[],
): boolean {
	return parts.every(
		(part) => part.node.isConnected && part.node.nodeValue === part.value,
	);
}

export function renderedBlockContainsRawRuby(
	node: Node,
	root: HTMLElement,
): boolean {
	const parent = node.parentElement;
	if (!parent) return false;
	const block = closestRenderedBlock(parent);
	return /[{}]/u.test((block ?? renderedScope(root)).textContent ?? '');
}
