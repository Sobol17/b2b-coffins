import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { media, products, settings } from '../../src/lib/server/db/schema';
import { LandingService } from '../../src/lib/server/landing/landing.service';
import { migratedDatabase } from './helpers/db';

const db = migratedDatabase();
const root = mkdtempSync(join(tmpdir(), 'b2b-landing-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));
mkdirSync(join(root, 'products'));
const photo = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 7, 7, 7]);
writeFileSync(join(root, 'products', 'cover.jpg'), photo);

function product(sku: string, options: { published: boolean; deleted?: boolean }): number {
	const [row] = db
		.insert(products)
		.values({
			sku,
			title: `Модель «${sku}»`,
			isPublished: options.published,
			deletedAt: options.deleted === true ? new Date() : null
		})
		.returning()
		.all();
	return row?.id ?? 0;
}

function cover(productId: number, sortOrder = 0): number {
	const [row] = db
		.insert(media)
		.values({
			path: 'products/cover.jpg',
			mime: 'image/jpeg',
			sizeBytes: photo.length,
			ownerScope: 'product',
			ownerId: productId,
			sortOrder
		})
		.returning()
		.all();
	return row?.id ?? 0;
}

function setFund(value: unknown): void {
	db.insert(settings)
		.values({ key: 'charity.fund', value })
		.onConflictDoUpdate({ target: settings.key, set: { value } })
		.run();
}

function setRate(value: unknown): void {
	db.insert(settings)
		.values({ key: 'charity.rate_bp', value })
		.onConflictDoUpdate({ target: settings.key, set: { value } })
		.run();
}

const published = product('LND-1', { published: true });
const publishedCover = cover(published);
const hidden = product('LND-2', { published: false });
const hiddenCover = cover(hidden);
const removed = product('LND-3', { published: true, deleted: true });
const removedCover = cover(removed);
const withoutPhoto = product('LND-4', { published: true });

describe('LandingService.works (P13)', () => {
	it('shows a published model with its cover and nothing else about it', () => {
		const works = new LandingService().works();

		const mine = works.filter((work) => work.title === 'Модель «LND-1»');
		expect(mine).toEqual([{ coverMediaId: publishedCover, title: 'Модель «LND-1»' }]);
		expect(Object.keys(mine[0] ?? {})).toEqual(['coverMediaId', 'title']);
	});

	it('leaves out a hidden model, a deleted one and a model without a photo', () => {
		const titles = new LandingService().works().map((work) => work.title);

		expect(titles).not.toContain('Модель «LND-2»');
		expect(titles).not.toContain('Модель «LND-3»');
		expect(titles).not.toContain('Модель «LND-4»');
		expect(withoutPhoto).toBeGreaterThan(0);
	});

	it('hands out nine covers at most', () => {
		for (let n = 0; n < 12; n += 1) cover(product(`LND-BULK-${n}`, { published: true }));

		const works = new LandingService().works();

		expect(works).toHaveLength(9);
	});

	it('takes the first photo of a model as its cover and shows the model once', () => {
		const model = product('LND-COVER', { published: true });
		const first = cover(model, 1);
		cover(model, 2);

		// The bulk models above fill the default nine, so this one is looked up with a wider limit.
		const works = new LandingService().works(100).filter((w) => w.title === 'Модель «LND-COVER»');

		expect(works).toEqual([{ coverMediaId: first, title: 'Модель «LND-COVER»' }]);
	});
});

describe('the public cover of a work (P13)', () => {
	it('opens the cover of a published model', async () => {
		const file = await new LandingService(root).cover(publishedCover);

		expect(file).toEqual({ mime: 'image/jpeg', bytes: photo });
	});

	it('answers nothing for a hidden, a deleted or an unknown model', async () => {
		const service = new LandingService(root);

		expect(await service.cover(hiddenCover)).toBeNull();
		expect(await service.cover(removedCover)).toBeNull();
		expect(await service.cover(999_999)).toBeNull();
	});

	it('answers nothing for a file that hangs on a request', async () => {
		const [attachment] = db
			.insert(media)
			.values({
				path: 'products/cover.jpg',
				mime: 'image/jpeg',
				sizeBytes: photo.length,
				ownerScope: 'request',
				ownerId: published
			})
			.returning()
			.all();

		expect(await new LandingService(root).cover(attachment?.id ?? 0)).toBeNull();
	});
});

describe('the charity block of the landing (P13)', () => {
	it('names the fund and the rate as a percent, without any collected sum', () => {
		setFund({ title: 'Фонд «Свет»', url: 'https://fund.example' });
		setRate(250);

		const block = new LandingService().charity();

		expect(block).toEqual({
			fundTitle: 'Фонд «Свет»',
			fundUrl: 'https://fund.example',
			ratePercent: 2.5
		});
	});

	it('keeps the block without a link when the fund has none', () => {
		setFund({ title: 'Фонд «Свет»' });
		setRate(100);

		expect(new LandingService().charity()).toEqual({
			fundTitle: 'Фонд «Свет»',
			fundUrl: null,
			ratePercent: 1
		});
	});

	it('hides the block while the workshop has named no fund or no rate', () => {
		db.delete(settings).where(eq(settings.key, 'charity.fund')).run();
		expect(new LandingService().charity()).toBeNull();

		setFund({ title: 'Фонд «Свет»' });
		setRate('позже');
		expect(new LandingService().charity()).toBeNull();
	});
});
