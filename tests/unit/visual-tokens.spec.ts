import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const COMPONENT_ROOTS = ['src/lib/ui', 'src/lib/portal', 'src/routes'];
const RAW_COLOUR = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(|\boklch\(/;

function resolveColour(css: string, token: string): string {
	const value = new RegExp(`${token}: ([^;]+);`).exec(css)?.[1]?.trim();
	if (value === undefined) throw new Error(`${token} is not defined`);
	const alias = /^var\((--[\w-]+)\)$/.exec(value)?.[1];
	return alias === undefined ? value : resolveColour(css, alias);
}

function luminance(hex: string): number {
	const [r = 0, g = 0, b = 0] = [1, 3, 5].map((at) => {
		const channel = parseInt(hex.slice(at, at + 2), 16) / 255;
		return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
	});
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
	const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
	return (light + 0.05) / (dark + 0.05);
}

function svelteFiles(root: string): string[] {
	return readdirSync(root, { recursive: true, encoding: 'utf8' })
		.filter((path) => path.endsWith('.svelte'))
		.map((path) => join(root, path));
}

describe('design tokens (tech.md 9, 18.2)', () => {
	it('keeps raw colours out of every component and page', () => {
		const offenders = COMPONENT_ROOTS.flatMap(svelteFiles).filter((file) =>
			RAW_COLOUR.test(readFileSync(file, 'utf8'))
		);

		expect(offenders).toEqual([]);
	});

	it('defines the palette of tech.md 18.2 in app.css', () => {
		const css = readFileSync('src/app.css', 'utf8');

		expect(css).toContain('--color-brand-200: #c4d8e5');
		expect(css).toContain('--color-brand-300: #a7c7e7');
		expect(css).toContain('--color-brand-400: #8eb1d1');
		expect(css).toContain('--color-brand-800: #1c2b48');
		expect(css).toContain('--color-neutral-200: #e8ecef');
		expect(css).toContain('--color-brand: var(--color-brand-800)');
		expect(css).toContain('--color-surface: var(--color-brand-150)');
		expect(css).toContain('--radius-card: 1.125rem');
		expect(css).toContain('--radius-pill: 9999px');
	});

	it('keeps every text pair of the palette at WCAG AA', () => {
		const css = readFileSync('src/app.css', 'utf8');
		const pairs: [fg: string, bg: string, min: number][] = [
			['--color-fg', '--color-surface', 4.5],
			['--color-fg-muted', '--color-surface', 4.5],
			['--color-fg-faint', '--color-surface-raised', 4.5],
			['--color-fg-muted', '--color-surface-muted', 4.5],
			['--color-brand-fg', '--color-brand', 4.5],
			['--color-brand-fg', '--color-brand-hover', 4.5],
			['--color-link', '--color-surface-raised', 4.5],
			['--color-link', '--color-surface', 4.5],
			['--color-link', '--color-tone-info-soft', 4.5],
			['--color-tone-info', '--color-tone-info-soft', 4.5],
			['--color-tone-progress', '--color-tone-progress-soft', 4.5],
			['--color-tone-ready', '--color-tone-ready-soft', 4.5],
			// Headline accent and step numerals are 36 px and up, so the large-text bar applies.
			['--color-brand-500', '--color-surface', 3]
		];

		for (const [fg, bg, min] of pairs) {
			expect(
				contrast(resolveColour(css, fg), resolveColour(css, bg)),
				`${fg} on ${bg}`
			).toBeGreaterThanOrEqual(min);
		}
	});

	it('loads fonts from the app itself, never from a font service', () => {
		const css = readFileSync('static/fonts/fonts.css', 'utf8');

		expect(css).toContain('@font-face');
		expect(css).not.toMatch(/fonts\.(googleapis|gstatic)\.com/);
		for (const [, url] of css.matchAll(/url\('([^']+)'\)/g)) {
			expect(url).toMatch(/^\/fonts\/[\w-]+\.woff2$/);
		}
	});

	it('declares the faces once, outside the stylesheet Vite swaps in dev', () => {
		expect(readFileSync('src/app.css', 'utf8')).not.toContain('@font-face');
		expect(readFileSync('src/app.html', 'utf8')).toContain('/fonts/fonts.css');
	});
});
