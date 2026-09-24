import { asc, eq, inArray, isNull, or } from 'drizzle-orm';
import { BaseRepository } from '../core/repository';
import type { Tx } from '../db/client';
import { categories, counterparties, discountRules, products } from '../db/schema';
import type { DiscountRule } from '$lib/domain/request/discount-rules';

export interface ManagedDiscountRuleRow {
	readonly id: number;
	readonly counterpartyId: number | null;
	readonly categoryId: number | null;
	readonly percent: number;
	readonly validFrom: Date | null;
	readonly validTo: Date | null;
}

const COLUMNS = {
	id: discountRules.id,
	counterpartyId: discountRules.counterpartyId,
	categoryId: discountRules.categoryId,
	percent: discountRules.percent,
	validFrom: discountRules.validFrom,
	validTo: discountRules.validTo
};

export class DiscountRuleRepository extends BaseRepository<typeof discountRules> {
	constructor() {
		super(discountRules);
	}

	list(tx?: Tx): ManagedDiscountRuleRow[] {
		return this.db(tx).select(COLUMNS).from(discountRules).orderBy(asc(discountRules.id)).all();
	}

	find(id: number, tx?: Tx): ManagedDiscountRuleRow | undefined {
		return this.db(tx).select(COLUMNS).from(discountRules).where(eq(discountRules.id, id)).get();
	}

	insert(input: Omit<ManagedDiscountRuleRow, 'id'>, tx: Tx): number {
		const [row] = this.db(tx)
			.insert(discountRules)
			.values(input)
			.returning({ id: discountRules.id })
			.all();
		if (!row) throw new Error('failed to insert discount rule');
		return row.id;
	}

	update(id: number, input: Omit<ManagedDiscountRuleRow, 'id'>, tx: Tx): void {
		this.db(tx).update(discountRules).set(input).where(eq(discountRules.id, id)).run();
	}

	delete(id: number, tx: Tx): void {
		this.db(tx).delete(discountRules).where(eq(discountRules.id, id)).run();
	}

	counterpartyExists(id: number, tx: Tx): boolean {
		return (
			this.db(tx)
				.select({ id: counterparties.id })
				.from(counterparties)
				.where(eq(counterparties.id, id))
				.get() !== undefined
		);
	}

	categoryExists(id: number, tx: Tx): boolean {
		return (
			this.db(tx)
				.select({ id: categories.id })
				.from(categories)
				.where(eq(categories.id, id))
				.get() !== undefined
		);
	}

	/** A portal request sees only its own rule and global rules, within their half-open windows. */
	activeFor(counterpartyId: number, at: Date = new Date(), tx?: Tx): DiscountRule[] {
		return this.db(tx)
			.select(COLUMNS)
			.from(discountRules)
			.where(
				or(isNull(discountRules.counterpartyId), eq(discountRules.counterpartyId, counterpartyId))
			)
			.all()
			.filter(
				(row) =>
					(row.validFrom === null || row.validFrom <= at) &&
					(row.validTo === null || at < row.validTo)
			)
			.map((row) => ({ percent: row.percent, categoryId: row.categoryId }));
	}

	/** Each model's category and its ancestors, so a parent rule covers child models. */
	pathsForProducts(productIds: readonly number[], tx?: Tx): Map<number, number[]> {
		if (productIds.length === 0) return new Map();
		const productRows = this.db(tx)
			.select({ id: products.id, categoryId: products.categoryId })
			.from(products)
			.where(inArray(products.id, [...productIds]))
			.all();
		const byId = new Map(
			this.db(tx)
				.select({ id: categories.id, parentId: categories.parentId })
				.from(categories)
				.all()
				.map((row) => [row.id, row.parentId])
		);
		return new Map(
			productRows.map((row) => {
				const path: number[] = [];
				for (let id = row.categoryId; id !== null; id = byId.get(id) ?? null) path.push(id);
				return [row.id, path];
			})
		);
	}
}
