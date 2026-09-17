import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const COMPONENT_ROOTS = ['src/lib/ui', 'src/lib/portal', 'src/routes'];
const RAW_COLOUR = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(|\boklch\(/;

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

	it('defines the palette of the mockups in app.css', () => {
		const css = readFileSync('src/app.css', 'utf8');

		expect(css).toContain('--color-brand-700: #2b6fae');
		expect(css).toContain('--color-neutral-200: #eef1f5');
		expect(css).toContain('--radius-card: 1.125rem');
		expect(css).toContain('--radius-pill: 9999px');
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
