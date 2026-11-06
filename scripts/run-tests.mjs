import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { build } from 'esbuild';

const outputFolder = await mkdtemp(join(tmpdir(), 'custom-furigana-tests-'));
const entryPoints = ['renderedText', 'autoFurigana'];

try {
	for (const entry of entryPoints) {
		const outputPath = join(outputFolder, `${entry}.test.mjs`);
		await build({
			entryPoints: [`tests/${entry}.test.ts`],
			bundle: true,
			platform: 'node',
			format: 'esm',
			outfile: outputPath,
			logLevel: 'silent',
			plugins: [
				{
					// The plugin runtime only exists inside Obsidian; the reading
					// helpers under test must not need it.
					name: 'obsidian-stub',
					setup(builder) {
						builder.onResolve({ filter: /^obsidian$/ }, () => ({
							path: join(process.cwd(), 'tests/obsidianStub.ts'),
						}));
					},
				},
			],
		});
		await import(pathToFileURL(outputPath).href);
	}
} finally {
	await rm(outputFolder, { recursive: true, force: true });
}
