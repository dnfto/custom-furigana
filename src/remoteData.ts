import { requestUrl, type Plugin } from 'obsidian';

import { DATA_ASSETS, DATA_RELEASE_TAG } from './dataAssets';

const RELEASE_BASE_URL =
	`https://github.com/dnfto/custom-furigana/releases/download/${DATA_RELEASE_TAG}`;
const pendingDownloads = new Map<string, Promise<void>>();

function toHex(bytes: Uint8Array): string {
	return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function sha256(data: ArrayBuffer): Promise<string> {
	return toHex(new Uint8Array(await crypto.subtle.digest('SHA-256', data)));
}

async function ensureFolders(plugin: Plugin, relativePath: string): Promise<void> {
	const adapter = plugin.app.vault.adapter;
	const parts = `${plugin.manifest.dir}/dict/${relativePath}`.split('/');
	parts.pop();
	let folder = '';
	for (const part of parts) {
		folder = folder ? `${folder}/${part}` : part;
		if (!(await adapter.exists(folder))) await adapter.mkdir(folder);
	}
}

async function downloadDataFile(plugin: Plugin, relativePath: string): Promise<void> {
	const record = DATA_ASSETS[relativePath];
	if (!record) throw new Error(`Unknown dictionary data file: ${relativePath}`);

	const response = await requestUrl(`${RELEASE_BASE_URL}/${encodeURIComponent(record.asset)}`);
	if (response.status < 200 || response.status >= 300) {
		throw new Error(`Failed to download ${relativePath}: HTTP ${response.status}`);
	}
	const actualHash = await sha256(response.arrayBuffer);
	if (actualHash !== record.sha256) {
		throw new Error(`Checksum mismatch for ${relativePath}`);
	}

	await ensureFolders(plugin, relativePath);
	await plugin.app.vault.adapter.writeBinary(
		`${plugin.manifest.dir}/dict/${relativePath}`,
		response.arrayBuffer,
	);
}

export async function ensureDataFile(
	plugin: Plugin,
	relativePath: string,
): Promise<void> {
	const target = `${plugin.manifest.dir}/dict/${relativePath}`;
	if (await plugin.app.vault.adapter.exists(target)) return;

	const key = `${plugin.manifest.id}:${relativePath}`;
	const inFlight = pendingDownloads.get(key);
	if (inFlight) return inFlight;

	const promise = downloadDataFile(plugin, relativePath);
	pendingDownloads.set(key, promise);
	try {
		await promise;
	} finally {
		pendingDownloads.delete(key);
	}
}
