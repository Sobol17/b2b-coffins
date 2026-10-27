import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, extname, isAbsolute, relative, resolve } from 'node:path';
import { and, eq } from 'drizzle-orm';
import type { Db } from '../../src/lib/server/db/client';
import { media } from '../../src/lib/server/db/schema';
import { storedFilePath } from '../../src/lib/server/files/storage';
import { matchesSignature } from '../../src/lib/domain/files/signature';

/** Where the photos of a price list come from and where the server keeps its files. */
export interface PhotoSource {
	readonly sourceDir: string;
	readonly filesRoot: string;
}

interface LoadedPhoto {
	readonly mime: string;
	readonly extension: string;
	readonly bytes: Buffer;
}

const JPEG = { mime: 'image/jpeg', extension: 'jpg' };
const TYPES: Readonly<Record<string, { mime: string; extension: string }>> = {
	'.jpg': JPEG,
	'.jpeg': JPEG,
	'.png': { mime: 'image/png', extension: 'png' },
	'.webp': { mime: 'image/webp', extension: 'webp' }
};

function loadPhoto(sourceDir: string, name: string): LoadedPhoto {
	const base = resolve(sourceDir);
	const full = resolve(base, name);
	const inside = relative(base, full);
	if (inside === '' || inside.startsWith('..') || isAbsolute(inside))
		throw new Error(`photo ${name} lies outside ${sourceDir}`);
	const type = Object.hasOwn(TYPES, extname(full).toLowerCase())
		? TYPES[extname(full).toLowerCase()]
		: undefined;
	const bytes = readFileSync(full);
	// The same gate as a CRM upload: the bytes, not the file name, decide what the file is.
	if (!type || !matchesSignature(type.mime, bytes))
		throw new Error(`${name} is not a JPEG, PNG or WebP`);
	return { ...type, bytes };
}

/** Reads every photo up front, so a broken file stops the import before anything is written. */
export function loadPhotos(
	products: readonly { sku: string; photos: readonly string[] }[],
	sourceDir: string
): Map<string, LoadedPhoto[]> {
	return new Map(
		products.map((product) => [
			product.sku,
			product.photos.map((name) => loadPhoto(sourceDir, name))
		])
	);
}

/**
 * Gives a model its photos from the price list. A model that already has a photo is left alone:
 * the gallery belongs to the CRM after the first import, and a rerun must not double it.
 * A rolled back import may leave a written file without a row; nothing ever serves such a file.
 */
export function attachPhotos(
	db: Db,
	productId: number,
	photos: readonly LoadedPhoto[],
	filesRoot: string
): number {
	const existing = db
		.select({ id: media.id })
		.from(media)
		.where(and(eq(media.ownerScope, 'product'), eq(media.ownerId, productId)))
		.get();
	if (existing) return 0;
	for (const [index, photo] of photos.entries()) {
		const path = `product/${productId}/${randomBytes(12).toString('hex')}.${photo.extension}`;
		const full = storedFilePath(path, filesRoot);
		if (full === null) throw new Error(`stored path escapes the files root: ${path}`);
		mkdirSync(dirname(full), { recursive: true });
		writeFileSync(full, photo.bytes);
		db.insert(media)
			.values({
				path,
				mime: photo.mime,
				sizeBytes: photo.bytes.length,
				ownerScope: 'product',
				ownerId: productId,
				sortOrder: index
			})
			.run();
	}
	return photos.length;
}
