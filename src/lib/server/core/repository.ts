import { and, type SQL } from 'drizzle-orm';
import type { SQLiteTable } from 'drizzle-orm/sqlite-core';
import { database, type Db, type Tx } from '../db/client';
import type { ActorContext } from '$lib/types/actor';

export abstract class BaseRepository<TTable extends SQLiteTable> {
	protected constructor(protected readonly table: TTable) {}

	protected db(tx?: Tx): Db | Tx {
		return tx ?? database;
	}

	/**
	 * Row-level guard for the portal contour. Every portal query mixes the counterparty of the
	 * actor into its `where`; a method that skips it does not pass review.
	 */
	protected scopedWhere(
		ctx: ActorContext,
		own: (counterpartyId: number) => SQL,
		extra?: SQL
	): SQL | undefined {
		if (ctx.scope === 'crm') return extra;
		if (ctx.counterpartyId === null) {
			throw new Error('portal actor without counterpartyId reached a repository');
		}
		const mine = own(ctx.counterpartyId);
		return extra === undefined ? mine : and(mine, extra);
	}
}
