import { eq } from 'drizzle-orm';
import { BaseRepository } from '../core/repository';
import type { Tx } from '../db/client';
import { numberingSequences } from '../db/schema';
import type { SequenceState } from '$lib/domain/documents/numbering';

export class NumberingRepository extends BaseRepository<typeof numberingSequences> {
	constructor() {
		super(numberingSequences);
	}

	find(key: string, tx: Tx): SequenceState | undefined {
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
}
