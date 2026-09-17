import { z } from 'zod';
import { CATALOG_SORTS, type CatalogFilters, type CatalogSort } from '$lib/types/catalog';
import { definedProps } from '$lib/utils/props';

const positiveId = z.coerce.number().int().positive();
const lengthCm = z.coerce.number().int().min(1).max(400);

/** Catalog filters. One schema for the storefront route, the service input and the tests. */
export const catalogFiltersSchema = z.object({
	categoryId: positiveId.optional(),
	materialIds: z.array(positiveId).max(50).optional(),
	colorOptionIds: z.array(positiveId).max(50).optional(),
	lengthFromMm: z.coerce.number().int().positive().optional(),
	lengthToMm: z.coerce.number().int().positive().optional(),
	inStock: z.boolean().optional()
});

export const productIdSchema = positiveId;
export const categoryIdSchema = positiveId;

export const catalogSortSchema = z.enum(CATALOG_SORTS).catch('sortOrder');

function idsOf(url: URL, key: string): number[] {
	return url.searchParams
		.getAll(key)
		.map((value) => positiveId.safeParse(value))
		.flatMap((result) => (result.success ? [result.data] : []));
}

function millimetresOf(url: URL, key: string): number | undefined {
	const parsed = lengthCm.safeParse(url.searchParams.get(key));
	return parsed.success ? parsed.data * 10 : undefined;
}

/**
 * Storefront query string: `material` and `color` repeat, lengths come in centimetres like the
 * form shows them. A tampered value is dropped instead of turning the page into an error.
 */
export function catalogFiltersFromUrl(url: URL): CatalogFilters {
	const materialIds = idsOf(url, 'material').slice(0, 50);
	const colorOptionIds = idsOf(url, 'color').slice(0, 50);
	return definedProps({
		materialIds: materialIds.length > 0 ? materialIds : undefined,
		colorOptionIds: colorOptionIds.length > 0 ? colorOptionIds : undefined,
		lengthFromMm: millimetresOf(url, 'lengthFrom'),
		lengthToMm: millimetresOf(url, 'lengthTo'),
		inStock: url.searchParams.get('inStock') === '1' ? true : undefined
	});
}

export function catalogSortFromUrl(url: URL): CatalogSort {
	return catalogSortSchema.parse(url.searchParams.get('sort') ?? undefined);
}
