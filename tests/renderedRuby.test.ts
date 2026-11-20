import assert from 'node:assert/strict';

import { parseHTML } from 'linkedom';

import {
	automaticRubyBase,
	generatedRubySource,
	restoreGeneratedRuby,
	unwrapAutomaticRuby,
} from '../src/renderedRuby';
import {
	renderedTextParts,
	renderedTextPartsAreCurrent,
	renderedTextRuns,
} from '../src/renderedText';

function createRoot(markup = ''): HTMLElement {
	const { document, Node, HTMLElement, Text } = parseHTML(
		`<html><body><div id="root">${markup}</div></body></html>`,
	).window;
	if (!Node.prototype.instanceOf) {
		Object.defineProperty(Node.prototype, 'instanceOf', {
			configurable: true,
			value(this: Node, type: { prototype: object }) {
				return type.prototype.isPrototypeOf(this);
			},
		});
	}
	Object.assign(globalThis, { document, Node, HTMLElement, Text });
	const root = document.querySelector<HTMLElement>('#root');
	assert.ok(root);
	return root;
}

function createRuby(syntax: 'auto' | 'legacy' | 'advanced'): HTMLElement {
	const ruby = document.createElement('ruby');
	ruby.className = `custom-furigana-ruby ${
		syntax === 'auto'
			? 'custom-furigana-auto-ruby'
			: 'custom-furigana-manual-ruby'
	}`;
	ruby.dataset.syntax = syntax;
	ruby.appendChild(document.createTextNode('漢字'));
	const rt = document.createElement('rt');
	rt.textContent = 'かんじ';
	ruby.appendChild(rt);
	return ruby;
}

function expectAnchor(parent: HTMLElement, anchor: Text): void {
	assert.equal(anchor.parentNode, parent, 'the renderer still owns its anchor');
	assert.ok(anchor.isConnected, 'the same anchor remains connected');
	assert.equal(anchor.nodeValue, '', 'the empty anchor remains empty');
}

function updateFragmentBeforeAnchor(parent: HTMLElement, anchor: Text): void {
	// Vue-style fragment updates retain a reference to an empty text boundary.
	// The inserted UI can be added and updated only while that node still belongs
	// to this parent. Avoid changing the player's implementation to work around it.
	const fragment = document.createDocumentFragment();
	const bar = document.createElement('div');
	bar.className = 'wv';
	bar.style.height = '40px';
	fragment.appendChild(bar);
	parent.insertBefore(fragment, anchor);
	assert.equal(bar.nextSibling, anchor);
	bar.style.height = '70px';
	assert.equal(bar.style.height, '70px');
	bar.remove();
	expectAnchor(parent, anchor);
}

let passed = 0;
function test(name: string, run: () => void): void {
	run();
	passed += 1;
	console.log(`  rendered-ruby: ${name}`);
}

for (const [syntax, expected] of [
	['auto', '漢字'],
	['legacy', '漢字{かんじ}'],
	['advanced', '{漢字|かんじ}'],
] as const) {
	test(`${syntax} ruby restores its original source`, () => {
		const root = createRoot();
		const ruby = createRuby(syntax);
		root.appendChild(ruby);
		assert.equal(generatedRubySource(ruby), expected);
		assert.equal(automaticRubyBase(ruby), syntax === 'auto' ? '漢字' : null);
	});
}

test('automatic ruby removal preserves its adjacent empty fragment anchor', () => {
	const root = createRoot();
	root.appendChild(document.createTextNode('前'));
	root.appendChild(createRuby('auto'));
	const anchor = document.createTextNode('');
	root.appendChild(anchor);
	root.appendChild(document.createTextNode('後'));

	unwrapAutomaticRuby(root);

	expectAnchor(root, anchor);
	assert.equal(root.textContent, '前漢字後');
	assert.equal(root.querySelector('ruby'), null);
	updateFragmentBeforeAnchor(root, anchor);
});

test('automatic ruby removal preserves unrelated widget anchors in the subtree', () => {
	const root = createRoot(
		'<div class="audio-player-ui"><div class="waveform"></div></div><p></p>',
	);
	const waveform = root.querySelector<HTMLElement>('.waveform');
	const paragraph = root.querySelector<HTMLElement>('p');
	assert.ok(waveform);
	assert.ok(paragraph);
	const anchor = document.createTextNode('');
	waveform.appendChild(anchor);
	paragraph.appendChild(createRuby('auto'));

	unwrapAutomaticRuby(root);

	expectAnchor(waveform, anchor);
	assert.equal(paragraph.textContent, '漢字');
	updateFragmentBeforeAnchor(waveform, anchor);
});

for (const [syntax, expected] of [
	['auto', '漢字'],
	['legacy', '漢字{かんじ}'],
	['advanced', '{漢字|かんじ}'],
] as const) {
	test(`${syntax} restoration retains adjacent text and fragment node identity`, () => {
		const root = createRoot();
		const prefix = document.createTextNode('前');
		const suffix = document.createTextNode('後');
		const anchor = document.createTextNode('');
		root.append(prefix, createRuby(syntax), anchor, suffix);

		restoreGeneratedRuby(root);

		expectAnchor(root, anchor);
		assert.equal(root.firstChild, prefix);
		assert.equal(root.lastChild, suffix);
		assert.equal(prefix.nodeValue, '前');
		assert.equal(suffix.nodeValue, '後');
		assert.equal(root.textContent, `前${expected}後`);
		assert.equal(root.querySelector('ruby'), null);
		updateFragmentBeforeAnchor(root, anchor);
	});
}

test('adjacent unmerged text stays readable with accurate DOM offsets', () => {
	const root = createRoot();
	const first = document.createTextNode('初');
	const ruby = createRuby('auto');
	ruby.firstChild!.nodeValue = '対面';
	const anchor = document.createTextNode('');
	const last = document.createTextNode('です');
	root.append(first, ruby, anchor, last);

	unwrapAutomaticRuby(root);

	expectAnchor(root, anchor);
	assert.equal(root.childNodes.length, 4, 'text nodes need not be merged to read them');
	assert.equal(root.firstChild, first);
	assert.equal(root.lastChild, last);
	const runs = renderedTextRuns(root);
	assert.equal(runs.length, 1);
	const { parts, text } = renderedTextParts(runs[0]!);
	assert.equal(text, '初対面です');
	assert.deepEqual(
		parts.map(({ start, end, value }) => ({ start, end, value })),
		[
			{ start: 0, end: 1, value: '初' },
			{ start: 1, end: 3, value: '対面' },
			{ start: 3, end: 5, value: 'です' },
		],
	);
	assert.ok(renderedTextPartsAreCurrent(parts));
	assert.equal(parts[0]!.node, first);
	assert.equal(parts[2]!.node, last);
});

test('automatic restoration without matching ruby leaves manual UI and anchors intact', () => {
	const root = createRoot();
	const manual = createRuby('legacy');
	const anchor = document.createTextNode('');
	root.append(manual, anchor);

	unwrapAutomaticRuby(root);
	unwrapAutomaticRuby(root);

	expectAnchor(root, anchor);
	assert.equal(root.firstChild, manual);
	assert.equal(manual.querySelector('rt')?.textContent, 'かんじ');
	assert.equal(generatedRubySource(manual), '漢字{かんじ}');
	updateFragmentBeforeAnchor(root, anchor);
});

console.log(`rendered-ruby DOM regressions passed (${passed} cases)`);
