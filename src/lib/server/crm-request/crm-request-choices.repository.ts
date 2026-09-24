import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { productVisible, variantVisible } from '../catalog/visibility';
import { BaseRepository } from '../core/repository';
import type { Tx } from '../db/client';
import {
	counterparties,
	dictItems,
	options,
	productOptions,
	productVariants,
	products,
	roles,
	userRoles,
	users
} from '../db/schema';
import {
	ASSIGNEE_ROLES,
	type AssigneeRole,
	type CrmRequestChoicesDto,
	type CrmRequestVariantChoice
} from '$lib/types/crm-request';

// The workshop orders what the storefront offers: a hidden model is hidden for a phone order too.
const STOREFRONT = { publishedOnly: true } as const;

/** Lists the forms of the workshop pick from: counterparties, positions, crew, refusal reasons. */
export class CrmRequestChoicesRepository extends BaseRepository<typeof counterparties> {
	constructor() {
		super(counterparties);
	}

	choices(): CrmRequestChoicesDto {
		return {
			counterparties: this.db()
				.select({ id: counterparties.id, name: counterparties.name })
				.from(counterparties)
				.where(and(isNull(counterparties.deletedAt), eq(counterparties.isActive, true)))
				.orderBy(asc(counterparties.name))
				.all(),
			variants: this.variants(),
			crew: this.crew(),
			refusalReasons: this.db()
				.select({ id: dictItems.id, title: dictItems.title })
				.from(dictItems)
				.where(and(eq(dictItems.dict, 'refusal_reason'), eq(dictItems.isActive, true)))
				.orderBy(asc(dictItems.sortOrder), asc(dictItems.title))
				.all()
		};
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

	/** Roles an active workshop account holds among the crew roles. */
	crewRoles(userId: number, tx?: Tx): AssigneeRole[] {
		return this.db(tx)
			.select({ role: roles.code })
			.from(userRoles)
			.innerJoin(roles, eq(roles.id, userRoles.roleId))
			.innerJoin(users, eq(users.id, userRoles.userId))
			.where(
				and(
					eq(userRoles.userId, userId),
					eq(users.scope, 'crm'),
					eq(users.isActive, true),
					isNull(users.deletedAt),
					inArray(roles.code, [...ASSIGNEE_ROLES])
				)
			)
			.all()
			.map((row) => row.role as AssigneeRole);
	}

	private crew(): CrmRequestChoicesDto['crew'] {
		const rows = this.db()
			.select({ id: users.id, fullName: users.fullName, role: roles.code })
			.from(users)
			.innerJoin(userRoles, eq(userRoles.userId, users.id))
			.innerJoin(roles, eq(roles.id, userRoles.roleId))
			.where(
				and(
					eq(users.scope, 'crm'),
					eq(users.isActive, true),
					isNull(users.deletedAt),
					inArray(roles.code, [...ASSIGNEE_ROLES])
				)
			)
			.orderBy(asc(users.fullName), asc(users.id))
			.all();
		const byUser = new Map<number, { id: number; fullName: string; roles: AssigneeRole[] }>();
		for (const row of rows) {
			const entry = byUser.get(row.id) ?? { id: row.id, fullName: row.fullName, roles: [] };
			entry.roles.push(row.role as AssigneeRole);
			byUser.set(row.id, entry);
		}
		return [...byUser.values()];
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
