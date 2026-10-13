// One-off: cuts the app icons of tech.md 17.1 out of the brand picture. Run
// `pnpm tsx scripts/icons.ts` after the picture changes and commit the files; the build never runs it.
import { mkdirSync, readFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const SOURCE = 'scripts/assets/brand-angel.jpg';
/** The picture is a square of this many pixels on a black field. */
const SOURCE_SIZE = 1254;
const FIELD = '#000000';

interface Crop {
	readonly x: number;
	readonly y: number;
	readonly width: number;
}

interface Icon {
	readonly file: string;
	readonly size: number;
	/** Share of the icon the picture takes: the rest is field around it. */
	readonly scale?: number;
	/** A square of the source instead of the whole picture. */
	readonly crop?: Crop;
	/** Corner radius as a share of the size, for files no launcher masks. */
	readonly radius?: number;
}

// At the size of a browser tab the whole scene is a blur: the tab gets the head under the halo.
const HEAD: Crop = { x: 440, y: 50, width: 540 };

const ICONS: readonly Icon[] = [
	{ file: 'icons/icon-192.png', size: 192 },
	{ file: 'icons/icon-512.png', size: 512 },
	// A launcher crops a maskable icon to a circle, so the scene stays inside the safe zone.
	{ file: 'icons/maskable-512.png', size: 512, scale: 0.74 },
	{ file: 'icons/apple-touch-icon.png', size: 180, scale: 0.94 },
	{ file: 'favicon.png', size: 64, crop: HEAD, radius: 0.2 },
	// The mark next to the wordmark: drawn at 40 px at most, stored for a dense screen.
	{ file: 'brand/mark.png', size: 144, radius: 0.2 }
];

function markup(icon: Icon, picture: string): string {
	const crop = icon.crop ?? { x: 0, y: 0, width: SOURCE_SIZE };
	const zoom = (icon.size * (icon.scale ?? 1)) / crop.width;
	const inset = (icon.size * (1 - (icon.scale ?? 1))) / 2;
	return `<style>
		html, body { margin: 0; background: transparent }
		div { width: ${icon.size}px; height: ${icon.size}px; overflow: hidden; position: relative;
			background: ${FIELD}; border-radius: ${(icon.radius ?? 0) * icon.size}px }
		img { position: absolute; width: ${SOURCE_SIZE * zoom}px;
			left: ${inset - crop.x * zoom}px; top: ${inset - crop.y * zoom}px }
	</style><div><img src="data:image/jpeg;base64,${picture}" /></div>`;
}

const picture = readFileSync(SOURCE).toString('base64');
mkdirSync('static/icons', { recursive: true });
mkdirSync('static/brand', { recursive: true });

const browser = await chromium.launch();
for (const icon of ICONS) {
	const page = await browser.newPage({ viewport: { width: icon.size, height: icon.size } });
	await page.setContent(markup(icon, picture));
	await page.locator('img').evaluate((img: HTMLImageElement) => img.decode());
	await page.screenshot({ path: `static/${icon.file}`, omitBackground: true });
	await page.close();
}
await browser.close();
