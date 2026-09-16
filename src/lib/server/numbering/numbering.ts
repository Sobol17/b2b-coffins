import type { Tx } from '../db/client';
import { NumberingRepository } from './numbering.repository';
import { nextNumber } from '$lib/domain/numbering/numbering';

export type NumberingKey = 'request' | 'invoice' | 'spec';

/**
 * Hands out document numbers. It needs the caller's transaction: SQLite has one writer, so the read
 * and the increment inside one transaction cannot give the same number twice.
 */
export class Numbering {
	constructor(private readonly repo: NumberingRepository = new NumberingRepository()) {}

	/** @throws Error when the sequence was never seeded: a request without a number must not exist. */
	next(key: NumberingKey, at: Date, timeZone: string, tx: Tx): string {
		const state = this.repo.find(key, tx);
		if (!state) throw new Error(`numbering sequence ${key} is missing, run the seed`);
		const next = nextNumber(state, at, timeZone);
		this.repo.save(key, next.periodKey, next.value, tx);
		return next.number;
	}
}
