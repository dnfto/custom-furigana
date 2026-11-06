import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';

import { parseHTML } from 'linkedom';

import { renderedTextRuns } from '../src/renderedText';

function createRoot(markup: string): HTMLElement {
	const { document, Node, HTMLElement, Text } = parseHTML(markup).window;
	Object.assign(globalThis, { document, Node, HTMLElement, Text });
	const root = document.querySelector<HTMLElement>('#root');
	assert.ok(root);
	return root;
}

function runTexts(markup: string): string[] {
	return renderedTextRuns(createRoot(markup)).map((run) =>
		run.map((node) => node.nodeValue ?? '').join(''),
	);
}

const cases: Array<[string, string, string[]]> = [
	[
		'adjacent spans',
		'<div id="root"><span>初</span><span>対面</span></div>',
		['初対面'],
	],
	[
		'br boundary',
		'<div id="root"><span>初</span><br><span>対面</span></div>',
		['初', '対面'],
	],
	[
		'hr boundary',
		'<div id="root"><span>初</span><hr><span>対面</span></div>',
		['初', '対面'],
	],
	[
		'different paragraphs',
		'<div id="root"><p><span>初</span></p><p><span>対面</span></p></div>',
		['初', '対面'],
	],
	[
		'nested div',
		'<div id="root"><span>初</span><div>別の文章</div><span>対面</span></div>',
		['初', '別の文章', '対面'],
	],
	[
		'inline emphasis',
		'<div id="root"><em>初</em><strong>対面</strong></div>',
		['初対面'],
	],
	[
		'inline whitespace',
		'<div id="root"><span>初</span> <span>対面</span></div>',
		['初 対面'],
	],
	[
		'excluded code',
		'<div id="root"><span>初</span><code>コード</code><span>対面</span></div>',
		['初', '対面'],
	],
];

for (const [name, markup, expected] of cases) {
	assert.deepEqual(runTexts(markup), expected, name);
}

const spans = Array.from({ length: 10_000 }, (_, index) =>
	`<span>${index % 2 === 0 ? '初' : '対面'}</span>`,
).join('');
const longRoot = createRoot(`<div id="root">${spans}</div>`);
const start = performance.now();
const longRuns = renderedTextRuns(longRoot);
const elapsed = performance.now() - start;
assert.equal(longRuns.length, 1);
assert.ok(elapsed < 500, `10,000-node traversal took ${elapsed.toFixed(1)} ms`);

console.log(
	`rendered-text DOM regressions passed (${elapsed.toFixed(1)} ms / 10,000 nodes)`,
);
