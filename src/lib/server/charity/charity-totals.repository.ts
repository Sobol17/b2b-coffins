import { eq } from 'drizzle-orm';
import { BaseRepository } from '../core/repository';
import { charityTotals } from '../db/schema';

export interface CharityTotal {
	readonly amountMinor: number;
	readonly requestCount: number;
}

/** Reads the banner read model. The totals themselves are rebuilt by `charity.recount` (P8). */
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
}
