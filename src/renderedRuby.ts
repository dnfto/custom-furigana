// Preserve existing Text nodes when restoring ruby. Vue and other renderers use
// empty Text nodes as insertion anchors; Node.normalize() would remove them.
// renderedTextRuns/Parts already read adjacent Text nodes as one text run.
export function automaticRubyBase(node: ChildNode | null): string | null {
	if (!node?.instanceOf(HTMLElement)) return null;
	if (!node.matches('ruby.custom-furigana-auto-ruby')) return null;
	let base = '';
	for (const child of Array.from(node.childNodes)) {
		if (child.instanceOf(HTMLElement) && child.tagName === 'RT') continue;
		base += child.textContent ?? '';
	}
	return base || null;
}

export function generatedRubySource(ruby: HTMLElement): string {
	const base = automaticRubyBase(ruby) ?? Array.from(ruby.childNodes)
		.filter(
			(child) =>
				!(child.instanceOf(HTMLElement) && child.tagName === 'RT'),
		)
		.map((child) => child.textContent ?? '')
		.join('');
	const reading = ruby.querySelector(':scope > rt')?.textContent ?? '';
	const syntax = ruby.dataset.syntax;
	if (syntax === 'auto') return base;
	if (syntax === 'advanced') return `{${base}|${reading}}`;
	return `${base}{${reading}}`;
}

export function unwrapAutomaticRuby(root: HTMLElement): void {
	for (const ruby of Array.from(
		root.querySelectorAll('ruby.custom-furigana-auto-ruby'),
	)) {
		const base = automaticRubyBase(ruby);
		if (!base || !ruby.parentNode) continue;
		ruby.parentNode.replaceChild(document.createTextNode(base), ruby);
	}
}

export function restoreGeneratedRuby(root: ParentNode): void {
	for (const ruby of Array.from(
		root.querySelectorAll<HTMLElement>(
			'ruby.custom-furigana-ruby[data-syntax]',
		),
	)) {
		if (!ruby.parentNode) continue;
		ruby.parentNode.replaceChild(
			document.createTextNode(generatedRubySource(ruby)),
			ruby,
		);
	}
}
