import { eq, sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { seedCatalog } from '../../scripts/seed/catalog';
import {
	options,
	productOptions,
	requestItemOptions,
	requestItems,
	requests
} from '../../src/lib/server/db/schema';
import { migratedDatabase } from './helpers/db';
import { seedOrderingWorld, variantId } from './helpers/portal-requests';

const db = migratedDatabase();
const world = seedOrderingWorld(db);
const VARIANT = variantId(db, 'MDL-201-180-PIN');

/** A database filled before v1.22 still holds the kinds the contract no longer knows. */
function legacyOption(kind: string, title: string): number {
	const row = db.get<{ id: number }>(
		sql`insert into options (kind, title, price_delta_minor) values (${kind}, ${title}, 60000) returning id`
	);
	db.insert(productOptions).values({ variantId: VARIANT, optionId: row.id }).run();
	return row.id;
}

function requestWith(number: string, status: 'draft' | 'new', optionId: number): number {
	const [request] = db
		.insert(requests)
		.values({ number, status, counterpartyId: world.cpId, createdById: world.adminId })
		.returning()
		.all();
	const [item] = db
		.insert(requestItems)
		.values({ requestId: request?.id ?? 0, variantId: VARIANT, qty: 1 })
		.returning()
		.all();
	db.insert(requestItemOptions)
		.values({ itemId: item?.id ?? 0, optionId, priceDeltaMinor: 60000 })
		.run();
	return item?.id ?? 0;
}

describe('the seed retires the option kinds v1.22 removed', () => {
	const unused = legacyOption('hardware', 'Фурнитура премиум');
	const inDraft = legacyOption('finish', 'Глянцевая отделка');
	const inSentRequest = legacyOption('lacquer', 'Лак «Орех»');
	const draftItem = requestWith('З-LEGACY-1', 'draft', inDraft);
	const sentItem = requestWith('З-LEGACY-2', 'new', inSentRequest);

	seedCatalog(db);

	const optionIds = (itemId: number) =>
		db
			.select({ id: requestItemOptions.optionId })
			.from(requestItemOptions)
			.where(eq(requestItemOptions.itemId, itemId))
			.all()
			.map((row) => row.id);

	it('leaves only colours in the compatibility matrix', () => {
		const kinds = db
			.selectDistinct({ kind: options.kind })
			.from(productOptions)
			.innerJoin(options, eq(options.id, productOptions.optionId))
			.all();

		expect(kinds).toEqual([{ kind: 'color' }]);
	});

	it('takes a retired option out of a draft, so the draft can still be sent', () => {
		expect(optionIds(draftItem)).toEqual([]);
	});

	it('keeps a sent request as it was and switches its option off', () => {
		expect(optionIds(sentItem)).toEqual([inSentRequest]);
		const [row] = db
			.select({ isActive: options.isActive })
			.from(options)
			.where(eq(options.id, inSentRequest))
			.all();
		expect(row?.isActive).toBe(false);
	});

	it('deletes retired options nothing refers to', () => {
		const left = db
			.select({ id: options.id })
			.from(options)
			.all()
			.map((row) => row.id);

		expect(left).not.toContain(unused);
		expect(left).not.toContain(inDraft);
	});
});
