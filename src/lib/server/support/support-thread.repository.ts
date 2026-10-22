import { and, asc, desc, eq, or, sql, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import { PolicyService } from '../auth/policy';
import { countExpression, offsetFor } from '../core/list';
import { BaseRepository } from '../core/repository';
import { containsText } from '../core/search';
import type { Tx } from '../db/client';
import { counterparties, requests, supportThreads, users } from '../db/schema';
import type { ActorContext } from '$lib/types/actor';
import type { ListQuery } from '$lib/types/list';
import type { SupportSide, SupportThreadFilters, SupportThreadStatus } from '$lib/types/support';

export interface SupportThreadRow {
	readonly id: number;
	readonly counterpartyId: number;
	readonly counterpartyName: string;
	readonly createdById: number;
	readonly authorName: string;
	readonly requestId: number | null;
	readonly requestNumber: string | null;
	readonly subject: string;
	readonly status: SupportThreadStatus;
	readonly lastMessageAt: Date;
	readonly lastMessageSide: SupportSide;
	readonly closedAt: Date | null;
	readonly closedByName: string | null;
	readonly createdAt: Date;
}

export interface NewThread {
	readonly counterpartyId: number;
	readonly createdById: number;
	readonly requestId: number | null;
	readonly subject: string;
	readonly at: Date;
}

const author = alias(users, 'support_author');
const closer = alias(users, 'support_closer');

const COLUMNS = {
	id: supportThreads.id,
	counterpartyId: supportThreads.counterpartyId,
	counterpartyName: counterparties.name,
	createdById: supportThreads.createdById,
	authorName: author.fullName,
	requestId: supportThreads.requestId,
	requestNumber: requests.number,
	subject: supportThreads.subject,
	status: supportThreads.status,
	lastMessageAt: supportThreads.lastMessageAt,
	lastMessageSide: supportThreads.lastMessageSide,
	closedAt: supportThreads.closedAt,
	closedByName: closer.fullName,
	createdAt: supportThreads.createdAt
};

const isOpen = eq(supportThreads.status, 'open');
// The turn of a side: the thread is open and the other side wrote last.
const awaitingOf = (side: SupportSide): SQL =>
	sql`${isOpen} and ${supportThreads.lastMessageSide} = ${side === 'crm' ? 'portal' : 'crm'}`;

/** Support threads (tech.md 5.10). Every read goes through the fence of `own`. */
export class SupportThreadRepository extends BaseRepository<typeof supportThreads> {
	constructor() {
		super(supportThreads);
	}

	insert(row: NewThread, tx: Tx): number {
		const [created] = tx
			.insert(supportThreads)
			.values({
				counterpartyId: row.counterpartyId,
				createdById: row.createdById,
				requestId: row.requestId,
				subject: row.subject,
				lastMessageAt: row.at,
				lastMessageSide: 'portal'
			})
			.returning({ id: supportThreads.id })
			.all();
		if (!created) throw new Error('support thread insert returned no row');
		return created.id;
	}

	touch(id: number, at: Date, side: SupportSide, tx: Tx): void {
		tx.update(supportThreads)
			.set({ lastMessageAt: at, lastMessageSide: side })
			.where(eq(supportThreads.id, id))
			.run();
	}

	/** False when the thread was closed already: the caller then writes nothing more. */
	close(id: number, closedById: number, at: Date, tx: Tx): boolean {
		const result = tx
			.update(supportThreads)
			.set({ status: 'closed', closedAt: at, closedById })
			.where(and(eq(supportThreads.id, id), isOpen))
			.run();
		return result.changes > 0;
	}

	find(ctx: ActorContext, id: number, tx?: Tx): SupportThreadRow | undefined {
		const [row] = this.select(tx)
			.where(and(this.own(ctx), eq(supportThreads.id, id)))
			.all();
		return row;
	}

	page(
		ctx: ActorContext,
		query: ListQuery<SupportThreadFilters>
	): { rows: SupportThreadRow[]; total: number } {
		const where = and(this.own(ctx), ...this.filters(ctx, query.filters ?? {}, query.search));
		const rows = this.select()
			.where(where)
			.orderBy(...this.order(ctx))
			.limit(query.perPage)
			.offset(offsetFor(query))
			.all();
		const [count] = this.db()
			.select({ total: countExpression })
			.from(supportThreads)
			.innerJoin(counterparties, eq(counterparties.id, supportThreads.counterpartyId))
			.leftJoin(requests, eq(requests.id, supportThreads.requestId))
			.where(where)
			.all();
		return { rows, total: count?.total ?? 0 };
	}

	forRequest(ctx: ActorContext, requestId: number): SupportThreadRow[] {
		return this.select()
			.where(and(this.own(ctx), eq(supportThreads.requestId, requestId)))
			.orderBy(...this.order(ctx))
			.all();
	}

	/** Counterparties that have written at least once: the options of the CRM filter. */
	counterparties(): { id: number; name: string }[] {
		return this.db()
			.selectDistinct({ id: counterparties.id, name: counterparties.name })
			.from(supportThreads)
			.innerJoin(counterparties, eq(counterparties.id, supportThreads.counterpartyId))
			.orderBy(asc(counterparties.name))
			.all();
	}

	private select(tx?: Tx) {
		return this.db(tx)
			.select(COLUMNS)
			.from(supportThreads)
			.innerJoin(counterparties, eq(counterparties.id, supportThreads.counterpartyId))
			.innerJoin(author, eq(author.id, supportThreads.createdById))
			.leftJoin(requests, eq(requests.id, supportThreads.requestId))
			.leftJoin(closer, eq(closer.id, supportThreads.closedById));
	}

	/** The fence of the P6 registry: the counterparty, and for an employee only the own threads. */
	private own(ctx: ActorContext): SQL | undefined {
		return this.scopedWhere(ctx, (counterpartyId) => {
			const counterparty = eq(supportThreads.counterpartyId, counterpartyId);
			if (PolicyService.seesWholeCounterparty(ctx)) return counterparty;
			return and(counterparty, eq(supportThreads.createdById, ctx.userId)) ?? counterparty;
		});
	}

	private filters(
		ctx: ActorContext,
		filters: SupportThreadFilters,
		search: string | undefined
	): (SQL | undefined)[] {
		const text = filters.q ?? search;
		return [
			filters.status === undefined ? undefined : eq(supportThreads.status, filters.status),
			filters.awaiting === undefined ? undefined : awaitingOf(filters.awaiting),
			filters.counterpartyId === undefined || ctx.scope !== 'crm'
				? undefined
				: eq(supportThreads.counterpartyId, filters.counterpartyId),
			text === undefined || text === ''
				? undefined
				: or(
						containsText(supportThreads.subject, text),
						containsText(requests.number, text),
						containsText(counterparties.name, text)
					)
		];
	}

	/** The workshop sees its own turn first; the portal sees open threads before closed ones. */
	private order(ctx: ActorContext): SQL[] {
		const first =
			ctx.scope === 'crm'
				? sql`case when ${awaitingOf('crm')} then 0 when ${isOpen} then 1 else 2 end`
				: sql`case when ${isOpen} then 0 else 1 end`;
		return [asc(first), desc(supportThreads.lastMessageAt), desc(supportThreads.id)];
	}
}
