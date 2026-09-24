import { eq, sql } from 'drizzle-orm';
import { BaseRepository } from '../core/repository';
import type { Tx } from '../db/client';
import { numberingSequences, requests } from '../db/schema';
import type { SequenceState } from '$lib/domain/numbering/numbering';

export class NumberingRepository extends BaseRepository<typeof numberingSequences> {
	constructor() {
		super(numberingSequences);
	}

	find(key: string, tx?: Tx): SequenceState | undefined {
		const [row] = this.db(tx)
			.select({
				prefix: numberingSequences.prefix,
				period: numberingSequences.period,
				periodKey: numberingSequences.periodKey,
				lastValue: numberingSequences.lastValue
			})
			.from(numberingSequences)
			.where(eq(numberingSequences.key, key))
			.all();
		return row;
	}

	save(key: string, periodKey: string, lastValue: number, tx: Tx): void {
		this.db(tx)
			.update(numberingSequences)
			.set({ periodKey, lastValue })
			.where(eq(numberingSequences.key, key))
			.run();
	}

	/** Owner changed the prefix or the period (C1): every field of the state moves at once. */
	replace(key: string, state: SequenceState, tx: Tx): void {
		this.db(tx)
			.update(numberingSequences)
			.set({ ...state })
			.where(eq(numberingSequences.key, key))
			.run();
	}

	/** Request numbers that start with `head`. Compared by `substr`, so `%` in a prefix is literal. */
	issuedRequestNumbers(head: string, tx: Tx): string[] {
		// SQLite counts characters, not UTF-16 units: spread the string to count code points too.
		const length = [...head].length;
		return this.db(tx)
			.select({ number: requests.number })
			.from(requests)
			.where(sql`substr(${requests.number}, 1, ${length}) = ${head}`)
			.all()
			.map((row) => row.number);
	}
}
