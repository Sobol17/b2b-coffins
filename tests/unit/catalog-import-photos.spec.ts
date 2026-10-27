import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { and, asc, eq, like } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { catalogImportSchema, importCatalog } from '../../scripts/admin/catalog';
import { seedStockItems } from '../../scripts/seed/catalog';
import { seedDicts } from '../../scripts/seed/reference';
import { media, products } from '../../src/lib/server/db/schema';
import { matchesSignature } from '../../src/lib/domain/files/signature';
import { migratedDatabase } from './helpers/db';

const db = migratedDatabase();
seedDicts(db);
seedStockItems(db);

const fixtureDir = join('scripts', 'fixtures');
const fixture = catalogImportSchema.parse(
	JSON.parse(readFileSync(join(fixtureDir, 'catalog-angel.json'), 'utf8'))
);
const filesRoot = mkdtempSync(join(tmpdir(), 'catalog-photos-'));
const photos = { sourceDir: fixtureDir, filesRoot };
afterAll(() => rmSync(filesRoot, { recursive: true, force: true }));

function gallery(sku: string) {
	return db
		.select({ id: media.id, path: media.path, mime: media.mime, sizeBytes: media.sizeBytes })
		.from(media)
		.innerJoin(products, eq(products.id, media.ownerId))
		.where(and(eq(media.ownerScope, 'product'), eq(products.sku, sku)))
		.orderBy(asc(media.sortOrder), asc(media.id))
		.all();
}

function productPhotos(): number {
	return db.select().from(media).where(like(media.path, 'product/%')).all().length;
}

describe('photos of the workshop catalog', () => {
	it('lists a JPEG from the catalog PDF for every model that has one', () => {
		const withPhotos = fixture.products.filter((product) => product.photos.length > 0);

		expect(withPhotos).toHaveLength(43);
		for (const product of withPhotos) {
			for (const photo of product.photos) {
				const bytes = readFileSync(join(fixtureDir, photo));
				expect(matchesSignature('image/jpeg', bytes), photo).toBe(true);
			}
		}
	});

	it('makes the photo the cover of its model and stores the same bytes', () => {
		const result = importCatalog(db, fixture, { photos });

		expect(result.photos).toBe(43);
		const [cover] = gallery('ANG-0101');
		expect(cover).toMatchObject({ mime: 'image/jpeg' });
		const source = readFileSync(join(fixtureDir, 'catalog-angel', 'ANG-0101.jpg'));
		expect(readFileSync(join(filesRoot, cover!.path)).equals(source)).toBe(true);
		expect(cover!.sizeBytes).toBe(source.length);
		expect(gallery('ANG-0801')).toHaveLength(0);
	});

	it('adds nothing on a rerun and leaves a gallery the CRM changed alone', () => {
		const [kept] = gallery('ANG-0102');
		db.delete(media)
			.where(eq(media.id, gallery('ANG-0101')[0]!.id))
			.run();
		db.insert(media)
			.values({
				path: 'product/crm.jpg',
				mime: 'image/jpeg',
				sizeBytes: 1,
				ownerScope: 'product',
				ownerId: db.select().from(products).where(eq(products.sku, 'ANG-0101')).get()!.id
			})
			.run();
		const before = productPhotos();

		const result = importCatalog(db, fixture, { photos });

		expect(result.photos).toBe(0);
		expect(productPhotos()).toBe(before);
		expect(gallery('ANG-0101').map((row) => row.path)).toEqual(['product/crm.jpg']);
		expect(gallery('ANG-0102')).toEqual([kept]);
	});

	it('writes nothing when one photo is not an image', () => {
		const fake = mkdtempSync(join(tmpdir(), 'catalog-fake-'));
		writeFileSync(join(fake, 'one.jpg'), 'not a picture');
		const before = productPhotos();
		const broken = {
			...fixture,
			products: [{ ...fixture.products[0]!, sku: 'ANG-NEW-1', photos: ['one.jpg'] }]
		};

		expect(() => importCatalog(db, broken, { photos: { sourceDir: fake, filesRoot } })).toThrow(
			/one\.jpg is not a JPEG, PNG or WebP/
		);
		expect(productPhotos()).toBe(before);
		expect(db.select().from(products).where(eq(products.sku, 'ANG-NEW-1')).all()).toHaveLength(0);
		rmSync(fake, { recursive: true, force: true });
	});

	it('refuses a photo outside the folder of the file', () => {
		const broken = {
			...fixture,
			products: [{ ...fixture.products[0]!, photos: ['../../package.json'] }]
		};

		expect(() => importCatalog(db, broken, { photos })).toThrow(/outside/);
		expect(existsSync(filesRoot)).toBe(true);
	});
});
