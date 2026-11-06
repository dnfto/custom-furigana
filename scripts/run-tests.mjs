import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { build } from 'esbuild';

const outputFolder = await mkdtemp(join(tmpdir(), 'custom-furigana-tests-'));
const outputPath = join(outputFolder, 'rendered-text.test.mjs');

try {
	await build({
		entryPoints: ['tests/renderedText.test.ts'],
		bundle: true,
		platform: 'node',
		format: 'esm',
		outfile: outputPath,
		logLevel: 'silent',
	});
	await import(pathToFileURL(outputPath).href);
} finally {
	await rm(outputFolder, { recursive: true, force: true });
}
