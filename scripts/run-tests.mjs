import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { build } from 'esbuild';

const outputFolder = await mkdtemp(join(tmpdir(), 'custom-furigana-tests-'));
const testFiles = ['tests/renderedText.test.ts', 'tests/renderedRuby.test.ts'];

try {
	for (const [index, entryPoint] of testFiles.entries()) {
		const outputPath = join(outputFolder, `test-${index}.mjs`);
		await build({
			entryPoints: [entryPoint],
			bundle: true,
			platform: 'node',
			format: 'esm',
			outfile: outputPath,
			logLevel: 'silent',
		});
		await import(pathToFileURL(outputPath).href);
	}
} finally {
	await rm(outputFolder, { recursive: true, force: true });
}
