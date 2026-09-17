import { eq } from 'drizzle-orm';
import { BaseRepository } from '../core/repository';
import type { Tx } from '../db/client';
import { charityTotals } from '../db/schema';

export interface CharityTotal {
	readonly amountMinor: number;
	readonly requestCount: number;
}

/** The banner read model. Only `charity.recount` writes it, always as a full rebuild of one row. */
export class CharityTotalsRepository extends BaseRepository<typeof charityTotals> {
	constructor() {
		super(charityTotals);
	}

	findByScope(scope: string): CharityTotal | undefined {
		const [row] = this.db()
			.select({ amountMinor: charityTotals.amountMinor, requestCount: charityTotals.requestCount })
			.from(charityTotals)
			.where(eq(charityTotals.scope, scope))
			.all();
		return row;
	}

	/** Replaces the row, so running the same recount twice leaves the same numbers. */
	put(scope: string, total: CharityTotal, tx: Tx): void {
		this.db(tx)
			.insert(charityTotals)
			.values({ scope, ...total })
			.onConflictDoUpdate({
				target: charityTotals.scope,
				set: { ...total, updatedAt: new Date() }
			})
			.run();
	}
}
