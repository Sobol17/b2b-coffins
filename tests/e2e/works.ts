import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { and, eq } from 'drizzle-orm';
import { media, products } from '../../src/lib/server/db/schema';
import { e2eDb } from './transitions';

const FILES_DIR = './data/e2e-files';
const COVER_PATH = 'works/e2e-cover.png';

/** One-pixel PNG: the landing only has to show that a photo arrives, not what is on it. */
const COVER_BYTES = Buffer.from(
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
	'base64'
);

export interface SeededWorks {
	readonly title: string;
	readonly coverMediaId: number;
	readonly hiddenCoverMediaId: number;
}

/**
 * The seed carries no photos, so the landing spec puts its own in: one on a published model and
 * one on a hidden one. Both are written once and reused, like every other e2e fixture.
 */
export function seedWorks(): SeededWorks {
	const db = e2eDb();
	const full = join(FILES_DIR, COVER_PATH);
	mkdirSync(dirname(full), { recursive: true });
	writeFileSync(full, COVER_BYTES);

	const shown = product(db, 'E2E-WORK-1', 'Работа для лендинга', true);
	const hidden = product(db, 'E2E-WORK-2', 'Скрытая работа', false);
	return {
		title: 'Работа для лендинга',
		coverMediaId: cover(db, shown),
		hiddenCoverMediaId: cover(db, hidden)
	};
}

type Db = ReturnType<typeof e2eDb>;

function product(db: Db, sku: string, title: string, isPublished: boolean): number {
	// No category on purpose: the catalog groups of other specs must keep their counts.
	db.insert(products)
		.values({ sku, title, isPublished, categoryId: null, sortOrder: 900 })
		.onConflictDoUpdate({ target: products.sku, set: { title, isPublished, deletedAt: null } })
		.run();
	const [row] = db.select({ id: products.id }).from(products).where(eq(products.sku, sku)).all();
	if (!row) throw new Error(`failed to seed product ${sku}`);
	return row.id;
}

function cover(db: Db, productId: number): number {
	const [existing] = db
		.select({ id: media.id })
		.from(media)
		.where(and(eq(media.ownerScope, 'product'), eq(media.ownerId, productId)))
		.all();
	if (existing) return existing.id;

	const [row] = db
		.insert(media)
		.values({
			path: COVER_PATH,
			mime: 'image/png',
			sizeBytes: COVER_BYTES.length,
			ownerScope: 'product',
			ownerId: productId
		})
		.returning()
		.all();
	if (!row) throw new Error('failed to seed a cover');
	return row.id;
}
