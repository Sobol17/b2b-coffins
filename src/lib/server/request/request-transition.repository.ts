import { and, asc, eq, inArray, ne, type SQL } from 'drizzle-orm';
import { BaseRepository } from '../core/repository';
import { DebtRepository } from '../counterparty/debt.repository';
import type { Tx } from '../db/client';
import { PaymentMarkRepository } from '../payment/payment-mark.repository';
import { LoadingRepository } from '../stock/loading.repository';
import { StockFill } from '../stock/stock-fill';
import { ShopJobRepository } from '../crm-shop/shop-job.repository';
import {
	dictItems,
	productVariants,
	requestItems,
	requestStatusHistory,
	requests
} from '../db/schema';
import { isMadeByShop } from '$lib/domain/shop/dispatch';
import { DEBT_STATUSES, requestDebtMinor } from '$lib/domain/payment/debt';
import type { GuardFacts } from '$lib/domain/request/guards';
import { reachableStatuses } from '$lib/domain/request/state-machine';
import type { StampField } from '$lib/domain/request/transition-flow';
import type { ActorContext } from '$lib/types/actor';
import type { RequestStatus } from '$lib/types/request';

interface LineFacts {
	readonly itemId: number;
	readonly qty: number;
	readonly price: number;
	readonly stockItemId: number | null;
}

export interface TransitionRow {
	readonly id: number;
	readonly number: string;
	readonly status: RequestStatus;
	readonly counterpartyId: number | null;
	readonly createdById: number;
}

export interface HistoryEntry {
	readonly requestId: number;
	readonly fromStatus: RequestStatus;
	readonly toStatus: RequestStatus;
	readonly actorId: number | null;
	readonly reasonId: number | null;
	readonly comment: string | null;
}

/** What a status move reads and writes. Deciding whether the move is allowed is not its job. */
export class RequestTransitionRepository extends BaseRepository<typeof requests> {
	constructor(
		private readonly fill: StockFill = new StockFill(),
		private readonly loading: LoadingRepository = new LoadingRepository(),
		private readonly marks: PaymentMarkRepository = new PaymentMarkRepository(),
		private readonly debts: DebtRepository = new DebtRepository(),
		private readonly jobs: ShopJobRepository = new ShopJobRepository()
	) {
		super(requests);
	}

	/**
	 * A sent request the actor can reach: the own counterparty on the portal (only the own requests
	 * for an employee), any request for a CRM role that reads all, the ones the crew moves on.
	 */
	findVisible(ctx: ActorContext, id: number, scope: VisibilityScope, tx?: Tx) {
		const [row] = this.db(tx)
			.select({
				id: requests.id,
				number: requests.number,
				status: requests.status,
				counterpartyId: requests.counterpartyId,
				createdById: requests.createdById
			})
			.from(requests)
			.where(this.visibleWhere(ctx, scope, and(eq(requests.id, id), ne(requests.status, 'draft'))))
			.all();
		return row satisfies TransitionRow | undefined;
	}

	/** Existence only, so a foreign request answers 403 and a missing one 404. */
	exists(id: number, tx?: Tx): boolean {
		return (
			this.db(tx)
				.select({ id: requests.id })
				.from(requests)
				.where(and(eq(requests.id, id), ne(requests.status, 'draft')))
				.all().length > 0
		);
	}

	guardFacts(requestId: number, tx?: Tx): GuardFacts {
		const db = this.db(tx);
		const [row] = db
			.select({
				totalMinor: requests.totalMinor,
				status: requests.status,
				counterpartyId: requests.counterpartyId,
				isStockRequest: requests.isStockRequest,
				deliveryAddressId: requests.deliveryAddressId,
				deliveryAt: requests.deliveryAt,
				deceasedName: requests.deceasedName
			})
			.from(requests)
			.where(eq(requests.id, requestId))
			.all();
		const marks = this.marks.amounts(requestId, tx);
		const lines = this.lineFacts(requestId, tx);
		return {
			stockCovered: row?.isStockRequest
				? this.madeByShop(requestId, lines, tx)
				: this.fill.covers(requestId, tx),
			stockLinked: lines.every((line) => line.stockItemId !== null),
			unitPricesMinor: lines.map((line) => line.price),
			totalMinor: row?.totalMinor ?? 0,
			paymentMarksMinor: marks,
			otherDebtMinor: row ? this.otherDebtMinor(row, marks, tx) : 0,
			delivery: {
				isStockRequest: row?.isStockRequest ?? false,
				deliveryAddressId: row?.deliveryAddressId ?? null,
				deliveryAt: row?.deliveryAt ?? null,
				deceasedName: row?.deceasedName ?? null
			},
			loadedLines: this.loading.linesOf(requestId, tx)
		};
	}

	/** Every request in work, the order the automatic readiness walks them in. */
	inWorkIds(tx?: Tx): number[] {
		return this.db(tx)
			.select({ id: requests.id })
			.from(requests)
			.where(eq(requests.status, 'in_work'))
			.orderBy(asc(requests.id))
			.all()
			.map((row) => row.id);
	}

	private lineFacts(requestId: number, tx?: Tx): LineFacts[] {
		return this.db(tx)
			.select({
				itemId: requestItems.id,
				qty: requestItems.qty,
				price: requestItems.unitPriceMinor,
				stockItemId: productVariants.stockItemId
			})
			.from(requestItems)
			.innerJoin(productVariants, eq(productVariants.id, requestItems.variantId))
			.where(eq(requestItems.requestId, requestId))
			.all();
	}

	/** A stock request takes nothing from the shelf: it is covered by what the stations finished. */
	private madeByShop(requestId: number, lines: readonly LineFacts[], tx?: Tx): boolean {
		const made = this.jobs.madeByItem(requestId, tx);
		return isMadeByShop(
			lines.map((line) => ({ qty: line.qty, madeQty: made.get(line.itemId) ?? 0 }))
		);
	}

	/** Requests of the counterparty waiting for money, the oldest delivery first (tech.md v1.65). */
	awaitingOf(counterpartyId: number, tx?: Tx): number[] {
		return this.db(tx)
			.select({ id: requests.id })
			.from(requests)
			.where(
				and(eq(requests.counterpartyId, counterpartyId), eq(requests.status, 'awaiting_payment'))
			)
			.orderBy(asc(requests.deliveredAt), asc(requests.id))
			.all()
			.map((row) => row.id);
	}

	/** The debt of the counterparty without this request's own rest: the hold of guard fullyPaid. */
	private otherDebtMinor(
		row: { status: RequestStatus; counterpartyId: number | null; totalMinor: number },
		marks: readonly number[],
		tx?: Tx
	): number {
		if (row.counterpartyId === null) return 0;
		const own = (DEBT_STATUSES as readonly RequestStatus[]).includes(row.status)
			? requestDebtMinor(row.totalMinor, marks)
			: 0;
		return this.debts.of(row.counterpartyId, tx).debtMinor - own;
	}

	/** A rejection names its reason from the refusal_reason dictionary, nothing else. */
	isRefusalReason(reasonId: number, tx?: Tx): boolean {
		return (
			this.db(tx)
				.select({ id: dictItems.id })
				.from(dictItems)
				.where(
					and(
						eq(dictItems.id, reasonId),
						eq(dictItems.dict, 'refusal_reason'),
						eq(dictItems.isActive, true)
					)
				)
				.all().length > 0
		);
	}

	/** Guarded by the old status in the WHERE: a concurrent move of the same request changes nothing. */
	moveStatus(
		id: number,
		move: { from: RequestStatus; to: RequestStatus; stamp: StampField | undefined; at: Date },
		tx: Tx
	): boolean {
		const stamp = move.stamp ? { [move.stamp]: move.at } : {};
		return (
			this.db(tx)
				.update(requests)
				.set({ status: move.to, ...stamp })
				.where(and(eq(requests.id, id), eq(requests.status, move.from)))
				.run().changes > 0
		);
	}

	insertHistory(entry: HistoryEntry, tx: Tx): void {
		this.db(tx).insert(requestStatusHistory).values(entry).run();
	}

	/** Cash the driver took at the door (tech.md v1.43), dated by the delivery itself. */
	insertCashMark(
		mark: { requestId: number; amountMinor: number; createdById: number },
		tx: Tx
	): void {
		this.marks.insert({ ...mark, method: 'cash', paidAt: new Date(), comment: null }, tx);
		this.marks.syncPaid(mark.requestId, tx);
	}

	private visibleWhere(ctx: ActorContext, scope: VisibilityScope, extra: SQL | undefined) {
		// Nobody is assigned (v1.42): the crew sees the statuses its roles move a request out of.
		const crew =
			scope === 'crew' ? inArray(requests.status, reachableStatuses(ctx.roles)) : undefined;
		const own = scope === 'own' ? eq(requests.createdById, ctx.userId) : undefined;
		return this.scopedWhere(
			ctx,
			(counterpartyId) => eq(requests.counterpartyId, counterpartyId),
			and(extra, crew, own)
		);
	}
}

/** `all`: whole counterparty or whole workshop; `own`: created by the actor; `crew`: by status. */
export type VisibilityScope = 'all' | 'own' | 'crew';
