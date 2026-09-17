import { and, eq, inArray, notInArray } from 'drizzle-orm';
import type { Db } from '../../src/lib/server/db/client';
import {
	options,
	productOptions,
	requestItemOptions,
	requestItems,
	requests
} from '../../src/lib/server/db/schema';
import { OPTION_KINDS } from '../../src/lib/types/catalog';

/**
 * v1.22 left the colour as the only option kind. SQLite has no CHECK on `options.kind`, so a
 * database filled earlier keeps the old rows; the seed is the one place that touches every such
 * database, dev, e2e and the demo stand alike.
 * @returns how many retired options were found.
 */
export function retireLegacyOptions(db: Db): number {
	const legacyIds = db
		.select({ id: options.id })
		.from(options)
		.where(notInArray(options.kind, [...OPTION_KINDS]))
		.all()
		.map((row) => row.id);
	if (legacyIds.length === 0) return 0;

	db.transaction((tx) => {
		tx.delete(productOptions).where(inArray(productOptions.optionId, legacyIds)).run();

		// A draft is still being put together: the server would refuse to send it with these.
		const draftItemIds = tx
			.select({ id: requestItems.id })
			.from(requestItems)
			.innerJoin(requests, eq(requests.id, requestItems.requestId))
			.where(eq(requests.status, 'draft'));
		tx.delete(requestItemOptions)
			.where(
				and(
					inArray(requestItemOptions.optionId, legacyIds),
					inArray(requestItemOptions.itemId, draftItemIds)
				)
			)
			.run();

		// A sent request keeps its lines as the client ordered them.
		const usedIds = tx
			.selectDistinct({ id: requestItemOptions.optionId })
			.from(requestItemOptions)
			.where(inArray(requestItemOptions.optionId, legacyIds))
			.all()
			.map((row) => row.id);
		if (usedIds.length > 0) {
			tx.update(options).set({ isActive: false }).where(inArray(options.id, usedIds)).run();
		}
		tx.delete(options)
			.where(and(inArray(options.id, legacyIds), notInArray(options.id, usedIds)))
			.run();
	});
	return legacyIds.length;
}
