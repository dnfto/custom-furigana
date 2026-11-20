// Stand-in for the obsidian runtime, so the pure reading helpers can be unit
// tested outside of Obsidian (the plugin bundle is only ever loaded there).
export const Platform = {
	isMobileApp: false,
	isMobile: false,
	isDesktopApp: true,
};

export function requestUrl(): never {
	throw new Error('obsidian.requestUrl is not available in tests');
}
