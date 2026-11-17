import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { ConflictError } from '../../src/lib/server/core/errors';
import { StockItemService } from '../../src/lib/server/crm-stock/stock-item.service';
import {
	productVariants,
	requestItems,
	requests,
	shopJobs,
	shopTasks
} from '../../src/lib/server/db/schema';
import { stockItemId } from './helpers/crm-stock';
import { insertUser, migratedDatabase } from './helpers/db';
import { crmActor, seedOrderingWorld } from './helpers/portal-requests';

const db = migratedDatabase();
seedOrderingWorld(db);
const actor = crmActor(
	'manager',
	insertUser({ email: 'stock-archive-work@example.test', role: 'manager', counterpartyId: null })
);
const service = new StockItemService(actor);

describe('stock archive keeps active work attached to current accounting items', () => {
	it('protects an active request even after its catalog variant was deleted', () => {
		const id = stockItemId(db, 'MDL-201-200-PIN');
		const variant = db
			.select()
			.from(productVariants)
			.where(eq(productVariants.stockItemId, id))
			.get()!;
		const request = db
			.insert(requests)
			.values({
				number: 'ARCHIVE-ACTIVE',
				isStockRequest: true,
				createdById: actor.userId,
				status: 'in_work'
			})
			.returning()
			.get()!;
		db.insert(requestItems).values({ requestId: request.id, variantId: variant.id, qty: 1 }).run();
		db.update(productVariants)
			.set({ deletedAt: new Date() })
			.where(eq(productVariants.id, variant.id))
			.run();
		expect(() => service.archive(id)).toThrow(ConflictError);
		db.update(productVariants)
			.set({ deletedAt: null })
			.where(eq(productVariants.id, variant.id))
			.run();
	});

	it('protects unfinished production even on a terminal request', () => {
		const id = stockItemId(db, 'MDL-101-180-CHB');
		const variant = db
			.select()
			.from(productVariants)
			.where(eq(productVariants.stockItemId, id))
			.get()!;
		const request = db
			.insert(requests)
			.values({
				number: 'ARCHIVE-PRODUCTION',
				isStockRequest: true,
				createdById: actor.userId,
				status: 'cancelled'
			})
			.returning()
			.get()!;
		const line = db
			.insert(requestItems)
			.values({ requestId: request.id, variantId: variant.id, qty: 1 })
			.returning()
			.get()!;
		const task = db
			.insert(shopTasks)
			.values({ requestId: request.id, station: 'upholsterer' })
			.returning()
			.get()!;
		db.insert(shopJobs).values({ requestItemId: line.id, taskId: task.id, qty: 1 }).run();
		db.update(productVariants)
			.set({ deletedAt: new Date() })
			.where(eq(productVariants.id, variant.id))
			.run();
		expect(() => service.archive(id)).toThrow(ConflictError);
		db.update(productVariants)
			.set({ deletedAt: null })
			.where(eq(productVariants.id, variant.id))
			.run();
	});
});
