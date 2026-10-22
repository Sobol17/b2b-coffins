import { eq } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import { BaseRepository } from '../core/repository';
import type { Tx } from '../db/client';
import { counterparties, supportMessages, supportThreads, users } from '../db/schema';
import type { EventKey } from '$lib/types/events';
import type { SupportSide } from '$lib/types/support';

/** One act in a support thread as the fanout and the push read it at run time (tech.md 7.3). */
export interface SupportOccurrence {
	readonly threadId: number;
	readonly counterpartyId: number;
	readonly counterpartyName: string;
	readonly subject: string;
	readonly threadAuthorId: number;
	readonly actorId: number;
	readonly actorSide: SupportSide;
	readonly actorName: string;
	/** The message text; null for a closing, which carries none. */
	readonly body: string | null;
}

const actor = alias(users, 'support_actor');

/**
 * Reads who did what in a thread. The fanout payload carries ids only (tech.md 7.1), so the actor
 * comes from the rows: the message author, the thread author or the person who closed it.
 */
export class SupportFactsRepository extends BaseRepository<typeof supportThreads> {
	constructor() {
		super(supportThreads);
	}

	occurrence(eventKey: EventKey, entityId: number, tx?: Tx): SupportOccurrence | undefined {
		if (eventKey === 'support.message_posted') return this.ofMessage(entityId, tx);
		if (eventKey === 'support.opened') return this.ofOpening(entityId, tx);
		if (eventKey === 'support.closed') return this.ofClosing(entityId, tx);
		return undefined;
	}

	private ofMessage(messageId: number, tx?: Tx): SupportOccurrence | undefined {
		const [row] = this.thread(tx)
			.innerJoin(supportMessages, eq(supportMessages.threadId, supportThreads.id))
			.innerJoin(actor, eq(actor.id, supportMessages.authorId))
			.where(eq(supportMessages.id, messageId))
			.all();
		return row;
	}

	private ofOpening(threadId: number, tx?: Tx): SupportOccurrence | undefined {
		// The first message of a thread is its question: the push quotes it.
		const [row] = this.thread(tx)
			.innerJoin(supportMessages, eq(supportMessages.threadId, supportThreads.id))
			.innerJoin(actor, eq(actor.id, supportMessages.authorId))
			.where(eq(supportThreads.id, threadId))
			.orderBy(supportMessages.id)
			.limit(1)
			.all();
		return row;
	}

	private ofClosing(threadId: number, tx?: Tx): SupportOccurrence | undefined {
		const [row] = this.db(tx)
			.select({
				threadId: supportThreads.id,
				counterpartyId: supportThreads.counterpartyId,
				counterpartyName: counterparties.name,
				subject: supportThreads.subject,
				threadAuthorId: supportThreads.createdById,
				actorId: actor.id,
				actorScope: actor.scope,
				actorName: actor.fullName
			})
			.from(supportThreads)
			.innerJoin(counterparties, eq(counterparties.id, supportThreads.counterpartyId))
			.innerJoin(actor, eq(actor.id, supportThreads.closedById))
			.where(eq(supportThreads.id, threadId))
			.all();
		if (!row) return undefined;
		const { actorScope, ...rest } = row;
		return { ...rest, actorSide: actorScope, body: null };
	}

	private thread(tx?: Tx) {
		return this.db(tx)
			.select({
				threadId: supportThreads.id,
				counterpartyId: supportThreads.counterpartyId,
				counterpartyName: counterparties.name,
				subject: supportThreads.subject,
				threadAuthorId: supportThreads.createdById,
				actorId: actor.id,
				actorSide: supportMessages.side,
				actorName: actor.fullName,
				body: supportMessages.body
			})
			.from(supportThreads)
			.innerJoin(counterparties, eq(counterparties.id, supportThreads.counterpartyId))
			.$dynamic();
	}
}
