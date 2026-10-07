// One-off: renders the app icons of tech.md 17.1. Run `pnpm tsx scripts/icons.ts` after the mark
// changes and commit the PNG files; the build never runs it.
import { mkdirSync, readFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

// The brand is the wordmark of the header, set in the heading face. An icon has room for its
// first letter only. The face carries no Cyrillic, and the Latin capital has the same shape.
const face = readFileSync('static/fonts/barlow-condensed-600-latin.woff2').toString('base64');
const LETTER = 'A';
// A launcher crops a maskable icon to a circle, so its letter stays inside the safe zone.
const ICONS = [
	{ file: 'icon-192.png', size: 192, letter: 0.74 },
	{ file: 'icon-512.png', size: 512, letter: 0.74 },
	{ file: 'maskable-512.png', size: 512, letter: 0.5 }
] as const;

mkdirSync('static/icons', { recursive: true });
const browser = await chromium.launch();
for (const icon of ICONS) {
	const page = await browser.newPage({ viewport: { width: icon.size, height: icon.size } });
	await page.setContent(`<style>
			@font-face { font-family: Mark; src: url(data:font/woff2;base64,${face}) format('woff2'); }
			body { margin: 0; height: 100vh; display: grid; place-items: center; background: #1c2b48; }
			span { font: 600 ${Math.round(icon.size * icon.letter)}px/1 Mark; color: #d0e2f5; }
		</style><span>${LETTER}</span>`);
	await page.evaluate(() => document.fonts.ready);
	await page.screenshot({ path: `static/icons/${icon.file}` });
	await page.close();
}
await browser.close();
