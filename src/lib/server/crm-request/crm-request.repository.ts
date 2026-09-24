import { and, asc, eq, ne } from 'drizzle-orm';
import { BaseRepository } from '../core/repository';
import type { Tx } from '../db/client';
import {
	counterparties,
	requestAssignees,
	requestStatusHistory,
	requests,
	users
} from '../db/schema';
import type { RequestTotals } from '$lib/domain/request/pricing';
import type { SettlementScheme } from '$lib/types/counterparty';
import type { AssigneeRole } from '$lib/types/crm-request';
import type { RequestPriority, RequestStatus } from '$lib/types/request';

export interface SteeredRow extends RequestTotals {
	readonly id: number;
	readonly counterpartyName: string | null;
	readonly scheme: SettlementScheme | null;
	readonly deliveredAt: Date | null;
	readonly number: string;
	readonly status: RequestStatus;
	readonly priority: RequestPriority;
	readonly counterpartyId: number | null;
	readonly isStockRequest: boolean;
}

export interface NewRequestValues {
	readonly number: string;
	readonly counterpartyId: number | null;
	readonly createdById: number;
	readonly priority: RequestPriority;
	readonly deliveryAddressId: number | null;
	readonly deliveryAt: Date | null;
	readonly deceasedName: string | null;
	readonly comment: string | null;
}

export interface CrewRow {
	readonly userId: number;
	readonly fullName: string;
	readonly role: AssigneeRole;
}

/** What the workshop writes on one request besides its status: creation, crew, priority, notes. */
export class CrmRequestRepository extends BaseRepository<typeof requests> {
	constructor() {
		super(requests);
	}

	/** A sent request of the workshop view; a draft is the counterparty's cart and stays unseen. */
	find(id: number, tx?: Tx): SteeredRow | undefined {
		const [row] = this.db(tx)
			.select({
				id: requests.id,
				number: requests.number,
				status: requests.status,
				priority: requests.priority,
				counterpartyId: requests.counterpartyId,
				isStockRequest: requests.isStockRequest,
				counterpartyName: counterparties.name,
				scheme: counterparties.settlementScheme,
				deliveredAt: requests.deliveredAt,
				itemsTotalMinor: requests.itemsTotalMinor,
				discountMinor: requests.discountMinor,
				totalMinor: requests.totalMinor
			})
			.from(requests)
			.leftJoin(counterparties, eq(counterparties.id, requests.counterpartyId))
			.where(and(eq(requests.id, id), ne(requests.status, 'draft')))
			.all();
		return row;
	}

	/** Born as a draft so the one `draft -> new` of tech.md 6.2 sends it, like the cart does. */
	insertDraft(values: NewRequestValues, tx: Tx): { id: number; number: string } {
		const [row] = this.db(tx)
			.insert(requests)
			.values({
				...values,
				isStockRequest: values.counterpartyId === null,
				status: 'draft'
			})
			.returning({ id: requests.id, number: requests.number })
			.all();
		if (!row) throw new Error('failed to create a workshop request');
		return row;
	}

	setPriority(id: number, priority: RequestPriority, tx: Tx): void {
		this.db(tx).update(requests).set({ priority }).where(eq(requests.id, id)).run();
	}

	crew(requestId: number, tx?: Tx): CrewRow[] {
		return this.db(tx)
			.select({
				userId: requestAssignees.userId,
				fullName: users.fullName,
				role: requestAssignees.role
			})
			.from(requestAssignees)
			.innerJoin(users, eq(users.id, requestAssignees.userId))
			.where(eq(requestAssignees.requestId, requestId))
			.orderBy(asc(requestAssignees.role), asc(users.fullName))
			.all();
	}

	/** @returns false when the person already holds that role on the request. */
	insertAssignee(requestId: number, userId: number, role: AssigneeRole, tx: Tx): boolean {
		return (
			this.db(tx)
				.insert(requestAssignees)
				.values({ requestId, userId, role })
				.onConflictDoNothing()
				.run().changes > 0
		);
	}

	/** @returns false when there was no such assignment. */
	deleteAssignee(requestId: number, userId: number, role: AssigneeRole, tx: Tx): boolean {
		return (
			this.db(tx)
				.delete(requestAssignees)
				.where(
					and(
						eq(requestAssignees.requestId, requestId),
						eq(requestAssignees.userId, userId),
						eq(requestAssignees.role, role)
					)
				)
				.run().changes > 0
		);
	}

	/**
	 * A change without a move: the status stays, the row keeps who changed what and why
	 * (tech.md v1.40). It is not a transition, so the state machine never sees it.
	 */
	insertNote(requestId: number, status: RequestStatus, actorId: number, comment: string, tx: Tx) {
		this.db(tx)
			.insert(requestStatusHistory)
			.values({ requestId, fromStatus: status, toStatus: status, actorId, comment })
			.run();
	}
}
