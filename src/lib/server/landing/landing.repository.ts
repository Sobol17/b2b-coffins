import { and, asc, eq, sql } from 'drizzle-orm';
import { BaseRepository } from '../core/repository';
import { productVisible } from '../catalog/visibility';
import { media, products } from '../db/schema';

export interface WorkRow {
	readonly coverMediaId: number;
	readonly title: string;
}

/** The first photo of a model in display order; the same cover the catalog tile shows. */
const coverOf = sql<number | null>`(
	select m.id from ${media} m
	where m.owner_scope = 'product' and m.owner_id = ${products.id}
	order by m.sort_order, m.id
	limit 1
)`;

/**
 * The only catalog read a guest reaches (P13). It selects a title and a photo id and nothing else:
 * no article, no price, no stock, so a leak would have to be added here on purpose.
 */
export class LandingRepository extends BaseRepository<typeof products> {
	constructor() {
		super(products);
	}

	works(limit: number): WorkRow[] {
		return this.db()
			.select({ coverMediaId: sql<number>`${coverOf}`, title: products.title })
			.from(products)
			.where(and(productVisible({ publishedOnly: true }), sql`${coverOf} is not null`))
			.orderBy(asc(products.sortOrder), asc(products.id))
			.limit(limit)
			.all();
	}

	/** Whether the model behind a photo is one a guest may see at all. */
	isPublished(productId: number): boolean {
		const [row] = this.db()
			.select({ id: products.id })
			.from(products)
			.where(and(productVisible({ publishedOnly: true }), eq(products.id, productId)))
			.all();
		return row !== undefined;
	}
}
