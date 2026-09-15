import { and, eq, isNull, type SQL } from 'drizzle-orm';
import { productVariants, products } from '../db/schema';

export interface Visibility {
	/** Drafts and hidden positions exist only for the workshop that manages the catalog. */
	readonly publishedOnly: boolean;
}

/** Deleted positions are gone for everyone; unpublished ones only for a role without catalog.manage. */
export function productVisible(visibility: Visibility): SQL | undefined {
	return and(
		isNull(products.deletedAt),
		visibility.publishedOnly ? eq(products.isPublished, true) : undefined
	);
}

export function variantVisible(visibility: Visibility): SQL | undefined {
	return and(
		isNull(productVariants.deletedAt),
		visibility.publishedOnly ? eq(productVariants.isPublished, true) : undefined
	);
}
