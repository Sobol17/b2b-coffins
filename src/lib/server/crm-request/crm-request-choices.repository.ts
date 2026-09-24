import { and, asc, eq, isNull } from 'drizzle-orm';
import { productVisible, variantVisible } from '../catalog/visibility';
import { BaseRepository } from '../core/repository';
import type { Tx } from '../db/client';
import {
	counterparties,
	dictItems,
	options,
	productOptions,
	productVariants,
	products
} from '../db/schema';
import type { CrmRequestChoicesDto, CrmRequestVariantChoice } from '$lib/types/crm-request';

// The workshop orders what the storefront offers: a hidden model is hidden for a phone order too.
const STOREFRONT = { publishedOnly: true } as const;

/** Lists the forms of the workshop pick from: counterparties, positions, refusal reasons. */
export class CrmRequestChoicesRepository extends BaseRepository<typeof counterparties> {
	constructor() {
		super(counterparties);
	}

	choices(): CrmRequestChoicesDto {
		return {
			counterparties: this.counterparties(),
			variants: this.variants(),
			refusalReasons: this.db()
				.select({ id: dictItems.id, title: dictItems.title })
				.from(dictItems)
				.where(and(eq(dictItems.dict, 'refusal_reason'), eq(dictItems.isActive, true)))
				.orderBy(asc(dictItems.sortOrder), asc(dictItems.title))
				.all()
		};
	}

	counterparties(): CrmRequestChoicesDto['counterparties'] {
		return this.db()
			.select({ id: counterparties.id, name: counterparties.name })
			.from(counterparties)
			.where(and(isNull(counterparties.deletedAt), eq(counterparties.isActive, true)))
			.orderBy(asc(counterparties.name))
			.all();
	}

	/** A live counterparty the workshop may still order for. */
	counterpartyExists(id: number, tx?: Tx): boolean {
		return (
			this.db(tx)
				.select({ id: counterparties.id })
				.from(counterparties)
				.where(
					and(
						eq(counterparties.id, id),
						isNull(counterparties.deletedAt),
						eq(counterparties.isActive, true)
					)
				)
				.all().length > 0
		);
	}

	private variants(): CrmRequestVariantChoice[] {
		const rows = this.db()
			.select({
				id: productVariants.id,
				sku: productVariants.sku,
				productTitle: products.title,
				sizeCode: productVariants.sizeCode,
				materialTitle: dictItems.title
			})
			.from(productVariants)
			.innerJoin(products, eq(products.id, productVariants.productId))
			.innerJoin(dictItems, eq(dictItems.id, productVariants.materialId))
			.where(and(productVisible(STOREFRONT), variantVisible(STOREFRONT)))
			.orderBy(asc(products.title), asc(productVariants.sku))
			.all();
		const matrix = this.db()
			.select({ variantId: productOptions.variantId, id: options.id, title: options.title })
			.from(productOptions)
			.innerJoin(options, eq(options.id, productOptions.optionId))
			.where(eq(options.isActive, true))
			.orderBy(asc(options.title))
			.all();
		return rows.map((row) => ({
			...row,
			options: matrix
				.filter((option) => option.variantId === row.id)
				.map(({ id, title }) => ({ id, title }))
		}));
	}
}
