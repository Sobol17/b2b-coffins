import { aliasedTable, and, asc, eq, isNull, ne, or, type SQL } from 'drizzle-orm';
import { BaseRepository } from '../core/repository';
import type { Tx } from '../db/client';
import {
	comments,
	deliveryAddresses,
	dictItems,
	media,
	requestStatusHistory,
	requests,
	users
} from '../db/schema';
import type { ActorContext } from '$lib/types/actor';
import type { RequestPriority, RequestStatus } from '$lib/types/request';

const author = aliasedTable(users, 'author');
const actor = aliasedTable(users, 'actor');

export interface CardRow {
	readonly id: number;
	readonly number: string;
	readonly status: RequestStatus;
	readonly priority: RequestPriority;
	readonly createdAt: Date;
	readonly submittedAt: Date | null;
	readonly externalNumber: string | null;
	readonly comment: string | null;
	readonly authorName: string | null;
	readonly deliveryAddress: string | null;
	readonly deliveryAt: Date | null;
	readonly deceasedName: string | null;
	readonly itemsTotalMinor?: number;
	readonly discountMinor?: number;
	readonly totalMinor?: number;
	readonly paidMinor?: number;
	readonly charityAmountMinor?: number | null;
}

export interface HistoryRow {
	readonly id: number;
	readonly fromStatus: RequestStatus | null;
	readonly toStatus: RequestStatus;
	readonly actorName: string | null;
	readonly reasonTitle: string | null;
	readonly comment: string | null;
	readonly createdAt: Date;
}

export interface CommentRow {
	readonly id: number;
	readonly authorId: number;
	readonly authorName: string | null;
	readonly body: string;
	readonly createdAt: Date;
}

export interface AttachmentRow {
	readonly id: number;
	readonly path: string;
	readonly mime: string;
	readonly sizeBytes: number;
	readonly createdAt: Date;
}

const CARD_COLUMNS = {
	id: requests.id,
	number: requests.number,
	status: requests.status,
	priority: requests.priority,
	createdAt: requests.createdAt,
	submittedAt: requests.submittedAt,
	externalNumber: requests.externalNumber,
	comment: requests.comment,
	authorName: author.fullName,
	deliveryAddress: deliveryAddresses.address,
	deliveryAt: requests.deliveryAt,
	deceasedName: requests.deceasedName
};

const MONEY_COLUMNS = {
	itemsTotalMinor: requests.itemsTotalMinor,
	discountMinor: requests.discountMinor,
	totalMinor: requests.totalMinor,
	paidMinor: requests.paidMinor,
	// A share of the total: the same rule as the money above keeps it from a price-blind role.
	charityAmountMinor: requests.charityAmountMinor
};

/** Everything the request card shows, read row by row. The right to see it is decided upstream. */
export class RequestCardRepository extends BaseRepository<typeof requests> {
	constructor() {
		super(requests);
	}

	findCard(ctx: ActorContext, id: number, ownOnly: boolean, tx?: Tx): CardRow | undefined {
		const columns = ctx.canSeePrices ? { ...CARD_COLUMNS, ...MONEY_COLUMNS } : CARD_COLUMNS;
		const [row] = this.db(tx)
			.select(columns)
			.from(requests)
			.leftJoin(author, eq(author.id, requests.createdById))
			.leftJoin(deliveryAddresses, eq(deliveryAddresses.id, requests.deliveryAddressId))
			.where(this.visibleWhere(ctx, id, ownOnly))
			.all();
		return row;
	}

	/** Existence of a sent request, so a foreign one answers 403 and a missing one 404. */
	exists(id: number, tx?: Tx): boolean {
		return (
			this.db(tx)
				.select({ id: requests.id })
				.from(requests)
				.where(and(eq(requests.id, id), ne(requests.status, 'draft')))
				.all().length > 0
		);
	}

	/**
	 * Moves of the request. A note (`from_status = to_status`, tech.md v1.40) is a workshop change
	 * without a move: the CRM card reads it, the portal does not.
	 */
	history(requestId: number, withNotes = false, tx?: Tx): HistoryRow[] {
		return this.db(tx)
			.select({
				id: requestStatusHistory.id,
				fromStatus: requestStatusHistory.fromStatus,
				toStatus: requestStatusHistory.toStatus,
				actorName: actor.fullName,
				reasonTitle: dictItems.title,
				comment: requestStatusHistory.comment,
				createdAt: requestStatusHistory.createdAt
			})
			.from(requestStatusHistory)
			.leftJoin(actor, eq(actor.id, requestStatusHistory.actorId))
			.leftJoin(dictItems, eq(dictItems.id, requestStatusHistory.reasonId))
			.where(
				and(
					eq(requestStatusHistory.requestId, requestId),
					withNotes
						? undefined
						: or(
								isNull(requestStatusHistory.fromStatus),
								ne(requestStatusHistory.fromStatus, requestStatusHistory.toStatus)
							)
				)
			)
			.orderBy(asc(requestStatusHistory.id))
			.all();
	}

	/** The portal reads the thread with the manager; an internal note never leaves the CRM. */
	comments(requestId: number, tx?: Tx): CommentRow[] {
		return this.db(tx)
			.select({
				id: comments.id,
				authorId: comments.authorId,
				authorName: users.fullName,
				body: comments.body,
				createdAt: comments.createdAt
			})
			.from(comments)
			.leftJoin(users, eq(users.id, comments.authorId))
			.where(and(eq(comments.requestId, requestId), eq(comments.isInternal, false)))
			.orderBy(asc(comments.id))
			.all();
	}

	/** A message of the portal thread: never internal, the CRM owns that flag (tech.md 5.6). */
	insertComment(entry: { requestId: number; authorId: number; body: string }, tx: Tx): CommentRow {
		const [created] = this.db(tx)
			.insert(comments)
			.values({ ...entry, isInternal: false })
			.returning({ id: comments.id, createdAt: comments.createdAt })
			.all();
		if (!created) throw new Error('failed to insert a request comment');
		return {
			...created,
			authorId: entry.authorId,
			authorName: this.authorName(entry.authorId, tx),
			body: entry.body
		};
	}

	insertAttachment(
		file: { requestId: number; path: string; mime: string; sizeBytes: number; uploadedBy: number },
		tx: Tx
	): AttachmentRow {
		const [created] = this.db(tx)
			.insert(media)
			.values({
				path: file.path,
				mime: file.mime,
				sizeBytes: file.sizeBytes,
				ownerScope: 'request',
				ownerId: file.requestId,
				uploadedBy: file.uploadedBy
			})
			.returning({ id: media.id, createdAt: media.createdAt })
			.all();
		if (!created) throw new Error('failed to insert a request attachment');
		return { ...created, path: file.path, mime: file.mime, sizeBytes: file.sizeBytes };
	}

	private authorName(userId: number, tx: Tx): string | null {
		const [row] = this.db(tx)
			.select({ fullName: users.fullName })
			.from(users)
			.where(eq(users.id, userId))
			.all();
		return row?.fullName ?? null;
	}

	attachments(requestId: number, tx?: Tx): AttachmentRow[] {
		return this.db(tx)
			.select({
				id: media.id,
				path: media.path,
				mime: media.mime,
				sizeBytes: media.sizeBytes,
				createdAt: media.createdAt
			})
			.from(media)
			.where(and(eq(media.ownerScope, 'request'), eq(media.ownerId, requestId)))
			.orderBy(asc(media.id))
			.all();
	}

	private visibleWhere(ctx: ActorContext, id: number, ownOnly: boolean): SQL | undefined {
		return this.scopedWhere(
			ctx,
			(counterpartyId) => eq(requests.counterpartyId, counterpartyId),
			and(
				eq(requests.id, id),
				ne(requests.status, 'draft'),
				ownOnly ? eq(requests.createdById, ctx.userId) : undefined
			)
		);
	}
}
