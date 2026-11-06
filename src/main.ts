import { syntaxTree } from '@codemirror/language';
import { RangeSetBuilder } from '@codemirror/state';
import {
	Decoration,
	type DecorationSet,
	EditorView,
	type PluginValue,
	ViewPlugin,
	type ViewUpdate,
	WidgetType,
} from '@codemirror/view';
import {
	type Command,
	editorLivePreviewField,
	type Editor,
	type EditorPosition,
	Menu,
	Modal,
	Notice,
	Plugin,
	PluginSettingTab,
	Setting,
} from 'obsidian';

import { AutoFuriganaEngine, type AutoRubyMatch } from './autoFurigana';
import {
	deduplicateDictionaryCandidates,
	normalizeKana,
	uniqueDictionaryStrings,
	type DictionaryCandidate,
} from './dictionaryCandidates';
import { translate, type TranslationKey, type UiLanguage } from './i18n';
import { type JlptLevel } from './jlptLevels';
import {
	LocalDictionary,
	type DictionaryStatus,
} from './localDictionary';

type FuriganaMode = 'dictionary' | 'visible' | 'hidden';
type RubySyntax = 'legacy' | 'advanced';
type RubySource = RubySyntax | 'auto';

const JLPT_LEVELS: JlptLevel[] = ['N5', 'N4', 'N3', 'N2', 'N1', 'unlisted'];
const DEFAULT_LIGHT_AUTO_COLORS: Record<JlptLevel, string> = {
	N5: '#2f9e44',
	N4: '#0c8599',
	N3: '#1971c2',
	N2: '#e67700',
	N1: '#c92a2a',
	unlisted: '#7048e8',
};
const DEFAULT_DARK_AUTO_COLORS: Record<JlptLevel, string> = {
	N5: '#69db7c',
	N4: '#66d9e8',
	N3: '#74c0fc',
	N2: '#ffc078',
	N1: '#ff8787',
	unlisted: '#b197fc',
};
const JLPT_LABEL_KEYS: Record<JlptLevel, TranslationKey> = {
	N5: 'jlptN5',
	N4: 'jlptN4',
	N3: 'jlptN3',
	N2: 'jlptN2',
	N1: 'jlptN1',
	unlisted: 'jlptUnlisted',
};

interface FuriganaSettings {
	uiLanguage: UiLanguage;
	mode: FuriganaMode;
	rubySize: number;
	lightRubyColor: string;
	darkRubyColor: string;
	autoLevelEnabled: Record<JlptLevel, boolean>;
	lightAutoColors: Record<JlptLevel, string>;
	darkAutoColors: Record<JlptLevel, string>;
	transitionMs: number;
	livePreview: boolean;
	maxDictionaryResults: number;
}

interface RubyMatch {
	start: number;
	end: number;
	base: string;
	reading: string;
	syntax: RubySource;
	jlptLevel?: JlptLevel;
}

const DEFAULT_SETTINGS: FuriganaSettings = {
	uiLanguage: 'ko',
	mode: 'visible',
	rubySize: 0.55,
	lightRubyColor: '',
	darkRubyColor: '',
	autoLevelEnabled: {
		N5: true,
		N4: true,
		N3: true,
		N2: true,
		N1: true,
		unlisted: true,
	},
	lightAutoColors: DEFAULT_LIGHT_AUTO_COLORS,
	darkAutoColors: DEFAULT_DARK_AUTO_COLORS,
	transitionMs: 160,
	livePreview: true,
	maxDictionaryResults: 16,
};

function createDefaultSettings(): FuriganaSettings {
	return {
		...DEFAULT_SETTINGS,
		autoLevelEnabled: { ...DEFAULT_SETTINGS.autoLevelEnabled },
		lightAutoColors: { ...DEFAULT_SETTINGS.lightAutoColors },
		darkAutoColors: { ...DEFAULT_SETTINGS.darkAutoColors },
	};
}

function currentAccentHex(): string {
	const value = getComputedStyle(document.body)
		.getPropertyValue('--interactive-accent')
		.trim();
	if (/^#[0-9a-f]{6}$/i.test(value)) return value;
	if (/^#[0-9a-f]{3}$/i.test(value)) {
		return `#${[...value.slice(1)].map((part) => part.repeat(2)).join('')}`;
	}
	const components = value.match(/[\d.]+/g)?.slice(0, 3).map(Number);
	if (components?.length === 3) {
		return `#${components
			.map((component) =>
				Math.max(0, Math.min(255, Math.round(component)))
					.toString(16)
					.padStart(2, '0'),
			)
			.join('')}`;
	}
	return '#7f6df2';
}

const JAPANESE_WORD = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}々〆ヶー]+/gu;
const HAN_BLOCK = /[\p{Script=Han}々〆ヶ]+/gu;
const LEGACY_RUBY = /([\p{Script=Han}々〆ヶ]+)\{([^{}|\n]+)\}/gu;
const ADVANCED_RUBY = /\{([^{}|\n]+)\|([^{}\n]+)\}/gu;

function isEscaped(text: string, index: number): boolean {
	let slashCount = 0;
	for (let i = index - 1; i >= 0 && text[i] === '\\'; i -= 1) slashCount += 1;
	return slashCount % 2 === 1;
}

export function extractRuby(text: string, offset = 0): RubyMatch[] {
	const matches: RubyMatch[] = [];

	for (const [syntax, pattern] of [
		['advanced', ADVANCED_RUBY],
		['legacy', LEGACY_RUBY],
	] as const) {
		pattern.lastIndex = 0;
		let match: RegExpExecArray | null;
		while ((match = pattern.exec(text)) !== null) {
			if (isEscaped(text, match.index)) continue;
			matches.push({
				start: offset + match.index,
				end: offset + pattern.lastIndex,
				base: match[1],
				reading: match[2],
				syntax,
			});
		}
	}

	matches.sort((a, b) => a.start - b.start || b.end - a.end);
	return matches.filter((candidate, index) => {
		return !matches.some((other, otherIndex) => {
			return (
				otherIndex < index &&
				other.start <= candidate.start &&
				other.end >= candidate.end
			);
		});
	});
}

interface KanjiReading {
	base: string;
	reading: string;
}

function extractKanjiReadings(surface: string, reading: string): KanjiReading[] {
	const blocks = [...surface.matchAll(HAN_BLOCK)];
	if (blocks.length === 0) return [];

	const normalizedReading = normalizeKana(reading);
	const result: KanjiReading[] = [];
	let readingCursor = 0;

	for (let index = 0; index < blocks.length; index += 1) {
		const block = blocks[index];
		const blockEnd = (block.index ?? 0) + block[0].length;
		const nextBlockStart = blocks[index + 1]?.index ?? surface.length;
		const kanaAnchor = normalizeKana(surface.slice(blockEnd, nextBlockStart));
		let readingEnd = normalizedReading.length;

		if (kanaAnchor) {
			const anchorIndex = normalizedReading.indexOf(kanaAnchor, readingCursor);
			if (anchorIndex < readingCursor) return [];
			readingEnd = anchorIndex;
		}

		const blockReading = reading.slice(readingCursor, readingEnd);
		if (!blockReading) return [];
		result.push({ base: block[0], reading: blockReading });
		readingCursor = readingEnd + kanaAnchor.length;
	}

	return result;
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function annotateWithFurigana(
	original: string,
	dictionaryWord: string,
	reading: string,
): string {
	const mappings = extractKanjiReadings(dictionaryWord, reading);
	let annotated = original;
	let replacementCount = 0;

	for (const { base, reading: blockReading } of mappings) {
		const pattern = new RegExp(escapeRegExp(base), 'u');
		if (!pattern.test(annotated)) continue;
		annotated = annotated.replace(pattern, `${base}{${blockReading}}`);
		replacementCount += 1;
	}

	if (replacementCount > 0) return annotated;

	const directMappings = extractKanjiReadings(original, reading);
	if (directMappings.length > 0) {
		annotated = original;
		for (const mapping of directMappings) {
			annotated = annotated.replace(
				new RegExp(escapeRegExp(mapping.base), 'u'),
				`${mapping.base}{${mapping.reading}}`,
			);
		}
		return annotated;
	}

	return `{${original}|${reading}}`;
}

function stripFurigana(text: string): string {
	return text
		.replace(ADVANCED_RUBY, '$1')
		.replace(LEGACY_RUBY, '$1');
}

function createRubyElement(
	match: Pick<RubyMatch, 'base' | 'reading' | 'syntax' | 'jlptLevel'>,
): HTMLElement {
	const ruby = createEl('ruby');
	ruby.className = `custom-furigana-ruby ${
		match.syntax === 'auto'
			? 'custom-furigana-auto-ruby'
			: 'custom-furigana-manual-ruby'
	}`;
	ruby.dataset.syntax = match.syntax;
	if (match.jlptLevel) ruby.dataset.jlpt = match.jlptLevel;
	ruby.tabIndex = 0;
	ruby.setAttribute('aria-label', `${match.base}, ${match.reading}`);
	ruby.appendText(match.base);
	ruby.createEl('rt', { text: match.reading });
	return ruby;
}

class FuriganaWidget extends WidgetType {
	constructor(
		private readonly match: RubyMatch,
		private readonly plugin: CustomFuriganaPlugin,
	) {
		super();
	}

	eq(other: FuriganaWidget): boolean {
		return (
			this.match.base === other.match.base &&
			this.match.reading === other.match.reading &&
			this.match.syntax === other.match.syntax &&
			this.match.jlptLevel === other.match.jlptLevel &&
			this.plugin.settingsRevision === other.plugin.settingsRevision
		);
	}

	toDOM(view: EditorView): HTMLElement {
		const ruby = createRubyElement(this.match);
		ruby.classList.add('custom-furigana-editor-ruby');
		ruby.addEventListener('mousedown', (event) => {
			if (event.button !== 0) return;
			event.preventDefault();
			view.dispatch({
				selection: {
					anchor:
						this.match.syntax === 'auto'
							? this.match.start
							: this.match.start + 1,
				},
			});
			view.focus();
		});
		return ruby;
	}

	ignoreEvent(): boolean {
		return false;
	}
}

function isInsideCode(view: EditorView, position: number): boolean {
	let node = syntaxTree(view.state).resolveInner(position, -1);
	while (node) {
		if (/code|math|frontmatter|html/i.test(node.name)) return true;
		if (!node.parent) break;
		node = node.parent;
	}
	return false;
}

function cursorTouchesMatch(view: EditorView, match: RubyMatch): boolean {
	return view.state.selection.ranges.some((range) => {
		if (range.empty) return range.from >= match.start && range.from <= match.end;
		return range.from < match.end && range.to > match.start;
	});
}

function autoMatchToRubyMatch(match: AutoRubyMatch): RubyMatch {
	return {
		...match,
		syntax: 'auto',
	};
}

function overlaps(left: RubyMatch, right: RubyMatch): boolean {
	return left.start < right.end && right.start < left.end;
}

function visibleTextRanges(
	view: EditorView,
): Array<{ from: number; to: number; text: string }> {
	const ranges = new Map<string, { from: number; to: number; text: string }>();
	for (const range of view.visibleRanges) {
		const from = view.state.doc.lineAt(range.from).from;
		const to = view.state.doc.lineAt(range.to).to;
		const key = `${from}:${to}`;
		if (!ranges.has(key)) {
			ranges.set(key, { from, to, text: view.state.doc.sliceString(from, to) });
		}
	}
	return [...ranges.values()];
}

function buildDecorations(
	view: EditorView,
	plugin: CustomFuriganaPlugin,
	automaticMatches: RubyMatch[] = [],
): DecorationSet {
	if (!plugin.settings.livePreview) return Decoration.none;
	if (!view.state.field(editorLivePreviewField, false)) return Decoration.none;

	const builder = new RangeSetBuilder<Decoration>();
	const collected = new Map<string, RubyMatch>();

	for (const range of visibleTextRanges(view)) {
		const { from, text } = range;
		for (const match of extractRuby(text, from)) {
			collected.set(`${match.start}:${match.end}`, match);
		}
	}
	const manualMatches = [...collected.values()];
	if (plugin.settings.mode === 'dictionary') {
		for (const match of automaticMatches) {
			if (!match.jlptLevel || !plugin.settings.autoLevelEnabled[match.jlptLevel]) {
				continue;
			}
			if (manualMatches.some((manual) => overlaps(manual, match))) continue;
			collected.set(`${match.start}:${match.end}`, match);
		}
	}

	const sorted = [...collected.values()].sort(
		(a, b) => a.start - b.start || b.end - a.end,
	);
	let previousEnd = -1;
	for (const match of sorted) {
		if (match.start < previousEnd) continue;
		if (cursorTouchesMatch(view, match) || isInsideCode(view, match.start)) continue;
		builder.add(
			match.start,
			match.end,
			Decoration.replace({
				widget: new FuriganaWidget(match, plugin),
				inclusive: false,
			}),
		);
		previousEnd = match.end;
	}

	return builder.finish();
}

function createLivePreviewExtension(plugin: CustomFuriganaPlugin) {
	return ViewPlugin.fromClass(
		class implements PluginValue {
			decorations: DecorationSet = Decoration.none;
			private revision = -1;
			private generation = 0;

			constructor(view: EditorView) {
				this.rebuild(view);
			}

			update(update: ViewUpdate): void {
				if (
					update.docChanged ||
					update.selectionSet ||
					update.viewportChanged ||
					this.revision !== plugin.settingsRevision
				) {
					this.rebuild(update.view);
				}
			}

			destroy(): void {
				this.generation += 1;
			}

			private rebuild(view: EditorView): void {
				this.revision = plugin.settingsRevision;
				const generation = ++this.generation;
				this.decorations = buildDecorations(view, plugin);
				if (
					plugin.settings.mode !== 'dictionary' ||
					!plugin.settings.livePreview
				) {
					return;
				}

				const ranges = visibleTextRanges(view);
				void Promise.all(
					ranges.map((range) =>
						plugin.autoFurigana.annotateText(range.text, range.from),
					),
				)
					.then((results) => {
						if (
							generation !== this.generation ||
							this.revision !== plugin.settingsRevision
						) {
							return;
						}
						this.decorations = buildDecorations(
							view,
							plugin,
							results.flat().map(autoMatchToRubyMatch),
						);
						view.dispatch({});
					})
					.catch((error) => {
						console.warn('Custom Furigana automatic reading failed', error);
					});
			}
		},
		{ decorations: (value) => value.decorations },
	);
}

class FuriganaInputModal extends Modal {
	private reading = '';

	constructor(
		private readonly plugin: CustomFuriganaPlugin,
		private readonly editor: Editor,
		private readonly selection: string,
	) {
		super(plugin.app);
	}

	onOpen(): void {
		this.setTitle(this.plugin.t('manualTitle'));
		this.contentEl.createEl('p', {
			cls: 'custom-furigana-modal-source',
			text: this.selection,
		});

		new Setting(this.contentEl)
			.setName(this.plugin.t('reading'))
			.setDesc(this.plugin.t('readingDesc'))
			.addText((text) => {
				text.setPlaceholder(this.plugin.t('readingPlaceholder'));
				text.inputEl.addEventListener('input', () => {
					this.reading = text.getValue().trim();
				});
				text.inputEl.addEventListener('keydown', (event) => {
					if (event.key === 'Enter') this.submit();
				});
				window.setTimeout(() => text.inputEl.focus(), 0);
			});

		new Setting(this.contentEl)
			.addButton((button) =>
				button.setButtonText(this.plugin.t('cancel')).onClick(() => this.close()),
			)
			.addButton((button) =>
				button
					.setButtonText(this.plugin.t('add'))
					.setCta()
					.onClick(() => this.submit()),
			);
	}

	private submit(): void {
		if (!this.reading) {
			new Notice(this.plugin.t('readingRequired'));
			return;
		}
		this.editor.replaceSelection(
			annotateWithFurigana(this.selection, this.selection, this.reading),
		);
		this.close();
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

class DictionaryModal extends Modal {
	private selectedIndex = 0;
	private resultElements: HTMLElement[] = [];
	private readonly candidates: DictionaryCandidate[];

	constructor(
		private readonly plugin: CustomFuriganaPlugin,
		private readonly editor: Editor,
		private readonly original: string,
		candidates: DictionaryCandidate[],
	) {
		super(plugin.app);
		this.candidates = deduplicateDictionaryCandidates(candidates);
	}

	onOpen(): void {
		this.contentEl.empty();
		this.resultElements = [];
		this.modalEl.addClass('custom-furigana-dictionary-modal');
		this.setTitle(this.plugin.t('lookupTitle', { query: this.original }));
		this.contentEl.createEl('p', {
			cls: 'custom-furigana-modal-help',
			text: this.plugin.t('lookupHelp'),
		});

		const list = this.contentEl.createDiv({
			cls: 'custom-furigana-results',
		});

		this.candidates.forEach((candidate, index) => {
			const result = list.createEl('button', {
				cls: 'custom-furigana-result',
				attr: { type: 'button' },
			});
			const heading = result.createSpan({
				cls: 'custom-furigana-result-heading',
			});
			heading.createEl('strong', { text: candidate.word });
			heading.createSpan({
				cls: 'custom-furigana-result-reading',
				text: candidate.reading,
			});

			const badges = [
				...(candidate.isCommon ? [this.plugin.t('common')] : []),
				...(this.plugin.settings.uiLanguage === 'ko'
					? [
							candidate.definitionLanguage === 'ko'
								? this.plugin.t('koreanDefinition')
								: this.plugin.t('englishFallback'),
						]
					: []),
				...candidate.jlpt,
			];
			if (badges.length > 0) {
				heading.createSpan({
					cls: 'custom-furigana-result-badges',
					text: badges.join(' · '),
				});
			}

			result.createSpan({
				cls: 'custom-furigana-result-definition',
				text: candidate.definitions.join('; '),
			});
			if (candidate.partsOfSpeech.length > 0) {
				result.createSpan({
					cls: 'custom-furigana-result-pos',
					text: candidate.partsOfSpeech.join(', '),
				});
			}

			result.addEventListener('mouseenter', () => this.select(index));
			result.addEventListener('click', () => this.insert(index));
			this.resultElements.push(result);
		});

		this.select(0);
		this.scope.register([], 'ArrowDown', (event) => {
			event.preventDefault();
			this.select(this.selectedIndex + 1);
			return false;
		});
		this.scope.register([], 'ArrowUp', (event) => {
			event.preventDefault();
			this.select(this.selectedIndex - 1);
			return false;
		});
		this.scope.register([], 'Enter', (event) => {
			event.preventDefault();
			this.insert(this.selectedIndex);
			return false;
		});
	}

	private select(index: number): void {
		if (this.resultElements.length === 0) return;
		this.selectedIndex = Math.max(0, Math.min(index, this.resultElements.length - 1));
		this.resultElements.forEach((element, elementIndex) => {
			element.toggleClass('is-selected', elementIndex === this.selectedIndex);
		});
		this.resultElements[this.selectedIndex]?.scrollIntoView({ block: 'nearest' });
	}

	private insert(index: number): void {
		const candidate = this.candidates[index];
		if (!candidate) return;
		this.editor.replaceSelection(
			annotateWithFurigana(this.original, candidate.word, candidate.reading),
		);
		this.close();
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

class CustomFuriganaSettingTab extends PluginSettingTab {
	constructor(private readonly plugin: CustomFuriganaPlugin) {
		super(plugin.app, plugin);
	}

	private addColorSetting(
		containerEl: HTMLElement,
		name: string,
		description: string,
		value: string,
		defaultValue: string,
		onChange: (value: string) => void,
		onReset: () => void,
	): void {
		new Setting(containerEl)
			.setName(name)
			.setDesc(description)
			.addColorPicker((picker) =>
				picker.setValue(value || defaultValue).onChange(async (color) => {
					onChange(color);
					await this.plugin.saveAndApplySettings();
				}),
			)
			.addExtraButton((button) =>
				button
					.setIcon('reset')
					.setTooltip(this.plugin.t('resetColor'))
					.onClick(async () => {
						onReset();
						await this.plugin.saveAndApplySettings();
						this.display();
					}),
			);
	}

	private addThemeColors(
		containerEl: HTMLElement,
		theme: 'light' | 'dark',
	): void {
		const colors =
			theme === 'light'
				? this.plugin.settings.lightAutoColors
				: this.plugin.settings.darkAutoColors;
		const defaults =
			theme === 'light' ? DEFAULT_LIGHT_AUTO_COLORS : DEFAULT_DARK_AUTO_COLORS;
		const manualColor =
			theme === 'light'
				? this.plugin.settings.lightRubyColor
				: this.plugin.settings.darkRubyColor;

		new Setting(containerEl)
			.setName(this.plugin.t(theme === 'light' ? 'lightModeColors' : 'darkModeColors'))
			.setHeading();
		this.addColorSetting(
			containerEl,
			this.plugin.t('manualRubyColor'),
			this.plugin.t('rubyColorDesc'),
			manualColor,
			currentAccentHex(),
			(value) => {
				if (theme === 'light') this.plugin.settings.lightRubyColor = value;
				else this.plugin.settings.darkRubyColor = value;
			},
			() => {
				if (theme === 'light') this.plugin.settings.lightRubyColor = '';
				else this.plugin.settings.darkRubyColor = '';
			},
		);

		for (const level of JLPT_LEVELS) {
			this.addColorSetting(
				containerEl,
				this.plugin.t('autoRubyColor', {
					level: this.plugin.t(JLPT_LABEL_KEYS[level]),
				}),
				this.plugin.t('autoRubyColorDesc'),
				colors[level],
				defaults[level],
				(value) => {
					colors[level] = value;
				},
				() => {
					colors[level] = defaults[level];
				},
			);
		}
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		new Setting(containerEl)
			.setName(this.plugin.t('settingsTitle'))
			.setHeading();

		new Setting(containerEl)
			.setName(this.plugin.t('language'))
			.setDesc(this.plugin.t('languageDesc'))
			.addDropdown((dropdown) =>
				dropdown
					.addOption('ko', this.plugin.t('languageKo'))
					.addOption('en', this.plugin.t('languageEn'))
					.addOption('ja', this.plugin.t('languageJa'))
					.setValue(this.plugin.settings.uiLanguage)
					.onChange(async (value) => {
						this.plugin.settings.uiLanguage = value as UiLanguage;
						await this.plugin.saveAndApplySettings();
						this.plugin.updateCommandNames();
						this.display();
					}),
			);

		new Setting(containerEl)
			.setName(this.plugin.t('display'))
			.setDesc(this.plugin.t('displayDesc'))
			.addDropdown((dropdown) =>
				dropdown
					.addOption('dictionary', this.plugin.t('modeDictionary'))
					.addOption('visible', this.plugin.t('modeVisible'))
					.addOption('hidden', this.plugin.t('modeHidden'))
					.setValue(this.plugin.settings.mode)
					.onChange(async (value) => {
						this.plugin.settings.mode = value as FuriganaMode;
						await this.plugin.saveAndApplySettings();
					}),
			);

		new Setting(containerEl)
			.setName(this.plugin.t('rubySize'))
			.setDesc(`${Math.round(this.plugin.settings.rubySize * 100)}%`)
			.addSlider((slider) =>
				slider
					.setLimits(0.35, 0.9, 0.05)
					.setValue(this.plugin.settings.rubySize)
					.onChange(async (value) => {
						this.plugin.settings.rubySize = value;
						await this.plugin.saveAndApplySettings();
					}),
			);

		new Setting(containerEl)
			.setName(this.plugin.t('automaticFurigana'))
			.setDesc(this.plugin.t('automaticFuriganaDesc'))
			.setHeading();
		for (const level of JLPT_LEVELS) {
			new Setting(containerEl)
				.setName(
					this.plugin.t('autoLevelToggle', {
						level: this.plugin.t(JLPT_LABEL_KEYS[level]),
					}),
				)
				.setDesc(this.plugin.t('autoLevelToggleDesc'))
				.addToggle((toggle) =>
					toggle
						.setValue(this.plugin.settings.autoLevelEnabled[level])
						.onChange(async (value) => {
							this.plugin.settings.autoLevelEnabled[level] = value;
							await this.plugin.saveAndApplySettings();
						}),
				);
		}

		new Setting(containerEl)
			.setName(this.plugin.t('rubyColors'))
			.setHeading();
		this.addThemeColors(containerEl, 'light');
		this.addThemeColors(containerEl, 'dark');

		new Setting(containerEl)
			.setName(this.plugin.t('livePreview'))
			.setDesc(this.plugin.t('livePreviewDesc'))
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.livePreview)
					.onChange(async (value) => {
						this.plugin.settings.livePreview = value;
						await this.plugin.saveAndApplySettings();
					}),
			);

		new Setting(containerEl)
			.setName(this.plugin.t('dictionary'))
			.setDesc(this.plugin.t('dictionaryDesc'))
			.setHeading();

		new Setting(containerEl)
			.setName(this.plugin.t('dictionaryStatus'))
			.setDesc(this.plugin.dictionaryStatusText());

		new Setting(containerEl)
			.setName(this.plugin.t('resultCount'))
			.addSlider((slider) =>
				slider
					.setLimits(5, 30, 1)
					.setValue(this.plugin.settings.maxDictionaryResults)
					.onChange(async (value) => {
						this.plugin.settings.maxDictionaryResults = value;
						await this.plugin.saveAndApplySettings();
					}),
			);
	}
}

export default class CustomFuriganaPlugin extends Plugin {
	settings: FuriganaSettings = createDefaultSettings();
	settingsRevision = 0;
	autoFurigana!: AutoFuriganaEngine;
	private readonly dictionaryCache = new Map<string, DictionaryCandidate[]>();
	private localDictionary!: LocalDictionary;
	private settingTab!: CustomFuriganaSettingTab;
	private ribbonButton: HTMLElement | null = null;
	private readonly localizedCommands: Array<{
		command: Command;
		nameKey: TranslationKey;
	}> = [];

	t(
		key: TranslationKey,
		variables: Record<string, string | number> = {},
	): string {
		return translate(this.settings.uiLanguage, key, variables);
	}

	dictionaryStatusText(): string {
		if (this.localDictionary?.status === 'ready' && this.localDictionary.isMobileMode) {
			return this.t('statusReadyMobile');
		}
		const statusKeys: Record<DictionaryStatus, TranslationKey> = {
			idle: 'statusIdle',
			downloading: 'statusDownloading',
			'loading-tokenizer': 'statusLoadingTokenizer',
			'building-index': 'statusBuildingIndex',
			ready: 'statusReady',
			error: 'statusError',
		};
		const text = this.t(statusKeys[this.localDictionary?.status ?? 'idle']);
		return this.localDictionary?.lastError
			? `${text}: ${this.localDictionary.lastError}`
			: text;
	}

	updateCommandNames(): void {
		for (const { command, nameKey } of this.localizedCommands) {
			command.name = this.t(nameKey);
		}
	}

	async onload(): Promise<void> {
		await this.loadSettings();
		this.applySettings();
		this.autoFurigana = new AutoFuriganaEngine(this);

		this.registerMarkdownPostProcessor((element) =>
			this.processRenderedFurigana(element),
		);
		this.registerEditorExtension(createLivePreviewExtension(this));
		this.settingTab = new CustomFuriganaSettingTab(this);
		this.addSettingTab(this.settingTab);
		this.ribbonButton = this.addRibbonIcon(
			'book-open',
			this.t('modeButtonTooltip'),
			(event) => this.openModeMenu(event),
		);
		this.updateModeButton();

		this.localizedCommands.push({
			nameKey: 'commandLookup',
			command: this.addCommand({
			id: 'lookup-and-add-furigana',
			name: this.t('commandLookup'),
			icon: 'languages',
			editorCallback: (editor) => void this.lookupAndInsert(editor),
			}),
		});

		this.localizedCommands.push({
			nameKey: 'commandManual',
			command: this.addCommand({
			id: 'add-furigana-manually',
			name: this.t('commandManual'),
			icon: 'braces',
			editorCheckCallback: (checking, editor) => {
				const selection = editor.getSelection();
				if (!selection) return false;
				if (!checking) new FuriganaInputModal(this, editor, selection).open();
				return true;
			},
			}),
		});

		this.localizedCommands.push({
			nameKey: 'commandRemove',
			command: this.addCommand({
			id: 'remove-furigana',
			name: this.t('commandRemove'),
			icon: 'eraser',
			editorCheckCallback: (checking, editor) => {
				const selection = editor.getSelection();
				if (!selection || stripFurigana(selection) === selection) return false;
				if (!checking) editor.replaceSelection(stripFurigana(selection));
				return true;
			},
			}),
		});

		this.localizedCommands.push({
			nameKey: 'commandToggle',
			command: this.addCommand({
			id: 'toggle-furigana-always-visible',
			name: this.t('commandToggle'),
			icon: 'book-open',
			callback: () => void this.cycleFuriganaMode(),
			}),
		});

		this.registerEvent(
			this.app.workspace.on('editor-menu', (menu, editor) => {
				menu.addItem((item) =>
					item
						.setTitle(this.t('menuLookup'))
						.setIcon('languages')
						.onClick(() => void this.lookupAndInsert(editor)),
				);
				if (editor.getSelection()) {
					menu.addItem((item) =>
						item
							.setTitle(this.t('menuManual'))
							.setIcon('braces')
							.onClick(() =>
								new FuriganaInputModal(this, editor, editor.getSelection()).open(),
							),
					);
				}
			}),
		);

		this.localDictionary = new LocalDictionary(this, (status) => {
			this.dictionaryCache.clear();
			if (this.settingTab?.containerEl.isConnected) this.settingTab.display();
			if (status === 'ready') new Notice(this.t('dictionaryReady'));
			if (status === 'error') new Notice(this.t('dictionaryError'));
		});
		void this.localDictionary.initialize();
	}

	onunload(): void {
		this.localDictionary?.destroy();
		this.autoFurigana?.clear();
		document.body.classList.remove(
			'custom-furigana-mode-hover',
			'custom-furigana-mode-always',
			'custom-furigana-mode-dictionary',
			'custom-furigana-mode-visible',
			'custom-furigana-mode-hidden',
		);
		document.documentElement.classList.remove('rt-always-visible');
		document.body.style.removeProperty('--custom-furigana-size');
		document.body.style.removeProperty('--custom-furigana-transition');
		document.body.style.removeProperty('--custom-furigana-light-color');
		document.body.style.removeProperty('--custom-furigana-dark-color');
		for (const level of JLPT_LEVELS) {
			document.body.style.removeProperty(
				`--custom-furigana-light-${level.toLowerCase()}-color`,
			);
			document.body.style.removeProperty(
				`--custom-furigana-dark-${level.toLowerCase()}-color`,
			);
		}
	}

	private async loadSettings(): Promise<void> {
		type LegacySettings = Partial<FuriganaSettings> & {
			displayMode?: 'hover' | 'always';
			rubyColor?: string;
		};
		const saved = ((await this.loadData()) ?? {}) as LegacySettings;
		const {
			displayMode: _legacyDisplayMode,
			rubyColor: legacyRubyColor,
			...current
		} = saved;
		const defaults = createDefaultSettings();
		this.settings = {
			...defaults,
			...current,
			mode: saved.mode ?? 'visible',
			lightRubyColor: saved.lightRubyColor ?? legacyRubyColor ?? '',
			darkRubyColor: saved.darkRubyColor ?? legacyRubyColor ?? '',
			autoLevelEnabled: {
				...defaults.autoLevelEnabled,
				...(saved.autoLevelEnabled ?? {}),
			},
			lightAutoColors: {
				...defaults.lightAutoColors,
				...(saved.lightAutoColors ?? {}),
			},
			darkAutoColors: {
				...defaults.darkAutoColors,
				...(saved.darkAutoColors ?? {}),
			},
		};
	}

	async saveAndApplySettings(): Promise<void> {
		await this.saveData(this.settings);
		this.dictionaryCache.clear();
		this.settingsRevision += 1;
		this.applySettings();
		this.updateModeButton();
		this.refreshViews();
	}

	private applySettings(): void {
		document.documentElement.classList.remove('rt-always-visible');
		document.body.classList.remove(
			'custom-furigana-mode-hover',
			'custom-furigana-mode-always',
		);
		for (const mode of ['dictionary', 'visible', 'hidden'] as const) {
			document.body.classList.toggle(
				`custom-furigana-mode-${mode}`,
				this.settings.mode === mode,
			);
		}
		document.body.style.setProperty(
			'--custom-furigana-size',
			`${this.settings.rubySize}em`,
		);
		document.body.style.setProperty(
			'--custom-furigana-light-color',
			this.settings.lightRubyColor || 'var(--interactive-accent)',
		);
		document.body.style.setProperty(
			'--custom-furigana-dark-color',
			this.settings.darkRubyColor || 'var(--interactive-accent)',
		);
		for (const level of JLPT_LEVELS) {
			document.body.style.setProperty(
				`--custom-furigana-light-${level.toLowerCase()}-color`,
				this.settings.lightAutoColors[level],
			);
			document.body.style.setProperty(
				`--custom-furigana-dark-${level.toLowerCase()}-color`,
				this.settings.darkAutoColors[level],
			);
		}
		document.body.style.setProperty(
			'--custom-furigana-transition',
			`${this.settings.transitionMs}ms`,
		);
	}

	private refreshViews(): void {
		for (const leaf of this.app.workspace.getLeavesOfType('markdown')) {
			const view = leaf.view as {
				editor?: { cm?: EditorView };
				previewMode?: { rerender?: (force?: boolean) => void };
			};
			const editorView = view.editor?.cm;
			editorView?.dispatch({});
			view.previewMode?.rerender?.(true);
		}
	}

	private async processRenderedFurigana(root: HTMLElement): Promise<void> {
		for (const ruby of Array.from(root.querySelectorAll('ruby'))) {
			if (ruby.classList.contains('custom-furigana-auto-ruby')) continue;
			ruby.classList.add(
				'custom-furigana-ruby',
				'custom-furigana-manual-ruby',
			);
		}

		const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
			acceptNode(node) {
				const parent = node.parentElement;
				if (!parent || !node.nodeValue?.includes('{')) return NodeFilter.FILTER_REJECT;
				if (
					parent.closest(
						'code, pre, kbd, samp, script, style, textarea, input, ruby, rt, .math, .frontmatter',
					)
				) {
					return NodeFilter.FILTER_REJECT;
				}
				return NodeFilter.FILTER_ACCEPT;
			},
		});

		const nodes: Text[] = [];
		while (walker.nextNode()) nodes.push(walker.currentNode as Text);

		for (const node of nodes) {
			const text = node.nodeValue ?? '';
			const matches = extractRuby(text);
			if (matches.length === 0) continue;

			const fragment = createFragment();
			let cursor = 0;
			for (const match of matches) {
				fragment.appendText(text.slice(cursor, match.start));
				fragment.appendChild(createRubyElement(match));
				cursor = match.end;
			}
			fragment.appendText(text.slice(cursor));
			node.parentNode?.replaceChild(fragment, node);
		}

		if (this.settings.mode !== 'dictionary') return;
		const autoWalker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
			acceptNode(node) {
				const parent = node.parentElement;
				if (!parent || !node.nodeValue || !/\p{Script=Han}/u.test(node.nodeValue)) {
					return NodeFilter.FILTER_REJECT;
				}
				if (
					parent.closest(
						'code, pre, kbd, samp, script, style, textarea, input, ruby, rt, .math, .frontmatter',
					)
				) {
					return NodeFilter.FILTER_REJECT;
				}
				return NodeFilter.FILTER_ACCEPT;
			},
		});
		const autoNodes: Text[] = [];
		while (autoWalker.nextNode()) autoNodes.push(autoWalker.currentNode as Text);

		for (const node of autoNodes) {
			if (!node.parentNode) continue;
			const text = node.nodeValue ?? '';
			try {
				const matches = (await this.autoFurigana.annotateText(text)).filter(
					(match) => this.settings.autoLevelEnabled[match.jlptLevel],
				);
				if (matches.length === 0 || !node.parentNode) continue;
				const fragment = createFragment();
				let cursor = 0;
				for (const match of matches) {
					fragment.appendText(text.slice(cursor, match.start));
					fragment.appendChild(
						createRubyElement(autoMatchToRubyMatch(match)),
					);
					cursor = match.end;
				}
				fragment.appendText(text.slice(cursor));
				node.parentNode.replaceChild(fragment, node);
			} catch (error) {
				console.warn('Custom Furigana automatic reading failed', error);
			}
		}
	}

	private openModeMenu(event: MouseEvent): void {
		const menu = new Menu();
		for (const mode of ['dictionary', 'visible', 'hidden'] as const) {
			const titleKey: Record<FuriganaMode, TranslationKey> = {
				dictionary: 'modeDictionary',
				visible: 'modeVisible',
				hidden: 'modeHidden',
			};
			const icon: Record<FuriganaMode, string> = {
				dictionary: 'book-open',
				visible: 'eye',
				hidden: 'eye-off',
			};
			menu.addItem((item) =>
				item
					.setTitle(this.t(titleKey[mode]))
					.setIcon(icon[mode])
					.setChecked(this.settings.mode === mode)
					.onClick(() => void this.setFuriganaMode(mode)),
			);
		}
		menu.showAtMouseEvent(event);
	}

	private async setFuriganaMode(mode: FuriganaMode): Promise<void> {
		if (this.settings.mode === mode) return;
		this.settings.mode = mode;
		await this.saveAndApplySettings();
		const noticeKey: Record<FuriganaMode, TranslationKey> = {
			dictionary: 'modeDictionaryNotice',
			visible: 'modeVisibleNotice',
			hidden: 'modeHiddenNotice',
		};
		new Notice(this.t(noticeKey[mode]));
	}

	private async cycleFuriganaMode(): Promise<void> {
		const modes: FuriganaMode[] = ['dictionary', 'visible', 'hidden'];
		const index = modes.indexOf(this.settings.mode);
		await this.setFuriganaMode(modes[(index + 1) % modes.length]);
	}

	private updateModeButton(): void {
		if (!this.ribbonButton) return;
		const labelKey: Record<FuriganaMode, TranslationKey> = {
			dictionary: 'modeDictionary',
			visible: 'modeVisible',
			hidden: 'modeHidden',
		};
		const label = `${this.t('modeButtonTooltip')}: ${this.t(
			labelKey[this.settings.mode],
		)}`;
		this.ribbonButton.setAttribute('aria-label', label);
		this.ribbonButton.setAttribute('data-tooltip-position', 'right');
	}

	private ensureJapaneseSelection(editor: Editor): string | null {
		const currentSelection = editor.getSelection().trim();
		if (currentSelection) return currentSelection;

		const cursor = editor.getCursor();
		const line = editor.getLine(cursor.line);
		JAPANESE_WORD.lastIndex = 0;
		let match: RegExpExecArray | null;
		while ((match = JAPANESE_WORD.exec(line)) !== null) {
			const start = match.index;
			const end = start + match[0].length;
			if (cursor.ch < start || cursor.ch > end) continue;
			const from: EditorPosition = { line: cursor.line, ch: start };
			const to: EditorPosition = { line: cursor.line, ch: end };
			editor.setSelection(from, to);
			return match[0];
		}
		return null;
	}

	private async lookupAndInsert(editor: Editor): Promise<void> {
		const query = this.ensureJapaneseSelection(editor);
		if (!query) {
			new Notice(this.t('selectJapanese'));
			return;
		}
		if (this.localDictionary.status !== 'ready') {
			new Notice(
				this.t('dictionaryNotReady', { status: this.dictionaryStatusText() }),
			);
			return;
		}

		try {
			new Notice(this.t('lookupInProgress', { query }), 1800);
			const candidates = await this.searchDictionary(query);
			if (candidates.length === 0) {
				new Notice(this.t('notFound', { query }));
				return;
			}
			new DictionaryModal(this, editor, query, candidates).open();
		} catch (error) {
			console.error('Custom Furigana dictionary lookup failed', error);
			new Notice(this.t('lookupFailed'));
		}
	}

	private async searchDictionary(query: string): Promise<DictionaryCandidate[]> {
		const cacheKey = `${this.settings.uiLanguage}\u0000${query}`;
		const cached = this.dictionaryCache.get(cacheKey);
		if (cached) return cached;
		const result = await this.localDictionary.lookup(query);

		const candidates: DictionaryCandidate[] = [];
		for (const entry of result.entries) {
			const englishDefinitions = uniqueDictionaryStrings(
				entry.sense
					.flatMap((sense) => sense.gloss)
					.filter((gloss) => gloss.lang === 'eng')
					.map((gloss) => gloss.text),
			).slice(0, 6);
			const englishPartsOfSpeech = uniqueDictionaryStrings(
				entry.sense.flatMap((sense) => sense.partOfSpeech),
			).slice(0, 3);

			const exactWrittenForms = entry.kanji.filter(
				(form) => form.text === result.matchedQuery || form.text === query,
			);
			const writtenForms =
				exactWrittenForms.length > 0
					? exactWrittenForms
					: entry.kanji.length > 0
						? entry.kanji
						: entry.kana;
			for (const form of writtenForms) {
				const readings = entry.kanji.length
					? entry.kana.filter(
							(kana) =>
								kana.appliesToKanji.includes('*') ||
								kana.appliesToKanji.includes(form.text),
						)
					: entry.kana.filter((kana) => kana.text === form.text);

				for (const readingForm of readings) {
					const word = form.text;
					const reading = readingForm.text;
					const korean =
						this.settings.uiLanguage === 'ko'
							? this.localDictionary.lookupKorean(word)
							: null;
					candidates.push({
						word,
						reading,
						definitions: uniqueDictionaryStrings(
							korean?.definitions ?? englishDefinitions,
						).slice(0, 6),
						partsOfSpeech:
							uniqueDictionaryStrings(
								korean?.partsOfSpeech ?? englishPartsOfSpeech,
							).slice(0, 3),
						definitionLanguage: korean ? 'ko' : 'en',
						isCommon: form.common || readingForm.common,
						jlpt: [],
					});
				}
			}
		}

		candidates.sort((a, b) => {
			const exactA = a.word === result.matchedQuery ? 1 : 0;
			const exactB = b.word === result.matchedQuery ? 1 : 0;
			if (exactA !== exactB) return exactB - exactA;
			if (a.isCommon !== b.isCommon) return a.isCommon ? -1 : 1;
			return a.word.length - b.word.length;
		});

		const limited = deduplicateDictionaryCandidates(candidates).slice(
			0,
			this.settings.maxDictionaryResults,
		);
		this.dictionaryCache.set(cacheKey, limited);
		return limited;
	}
}
