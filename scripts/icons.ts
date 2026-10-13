// One-off: renders the app icons of tech.md 17.1 from the mark below. Run `pnpm tsx scripts/icons.ts`
// after the mark changes and commit the files; the build never runs it.
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

// Cool Cerulean of the customer palette (tech.md 18.2) under a white figure.
const FIELD = '#8eb1d1';
const FIGURE = '#ffffff';

// The mark on a 512 grid: wings first, then the robe with a field-coloured outline that parts it
// from the wings, the head and the halo on top.
const MARK = `
	<path fill="${FIGURE}" d="M228 262 C168 176 96 150 44 172 C50 262 100 344 206 372 Z"/>
	<path fill="${FIGURE}" d="M284 262 C344 176 416 150 468 172 C462 262 412 344 306 372 Z"/>
	<path fill="${FIGURE}" stroke="${FIELD}" stroke-width="18" stroke-linejoin="round"
		d="M256 214 C300 214 322 244 332 296 L366 430 Q256 468 146 430 L180 296 C190 244 212 214 256 214 Z"/>
	<circle cx="256" cy="166" r="46" fill="${FIGURE}" stroke="${FIELD}" stroke-width="18"/>
	<ellipse cx="256" cy="84" rx="56" ry="16" fill="none" stroke="${FIGURE}" stroke-width="15"/>`;

/** `scale` shrinks the figure around the centre; `radius` rounds the field for a browser tab. */
function svg(scale: number, radius = 0): string {
	const shift = (256 * (1 - scale)).toFixed(1);
	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
	<rect width="512" height="512" rx="${radius}" fill="${FIELD}"/>
	<g transform="translate(${shift} ${shift}) scale(${scale})">${MARK}
	</g>
</svg>
`;
}

// A launcher crops a maskable icon to a circle, so its figure stays inside the safe zone.
const ICONS = [
	{ file: 'icons/icon-192.png', size: 192, scale: 0.86 },
	{ file: 'icons/icon-512.png', size: 512, scale: 0.86 },
	{ file: 'icons/maskable-512.png', size: 512, scale: 0.62 },
	{ file: 'icons/apple-touch-icon.png', size: 180, scale: 0.8 },
	{ file: 'favicon.png', size: 48, scale: 0.94, radius: 96 }
] as const;

mkdirSync('static/icons', { recursive: true });
writeFileSync('static/favicon.svg', svg(0.94, 96));

const browser = await chromium.launch();
for (const icon of ICONS) {
	const page = await browser.newPage({ viewport: { width: icon.size, height: icon.size } });
	const radius = 'radius' in icon ? icon.radius : 0;
	await page.setContent(
		`<style>body { margin: 0 } svg { display: block; width: 100vw; height: 100vh }</style>${svg(icon.scale, radius)}`
	);
	await page.screenshot({ path: `static/${icon.file}`, omitBackground: true });
	await page.close();
}
await browser.close();
