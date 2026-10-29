import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { BaseRepository } from '../core/repository';
import { containsText } from '../core/search';
import type { Tx } from '../db/client';
import {
	dictItems,
	options,
	productVariants,
	products,
	requestItems,
	requests,
	shopJobs,
	shopTasks,
	stockMoves,
	users
} from '../db/schema';
import type { RequestPriority } from '$lib/types/request';
import type { WorkRole } from '$lib/types/roles';

export interface VariantTitleRow {
	readonly id: number;
	readonly productTitle: string;
	readonly sku: string;
	readonly sizeCode: string;
	readonly materialTitle: string;
	readonly stockItemId: number | null;
}

/** A visit with what the crew may know of its request: no money, no counterparty, no deceased. */
export interface ShopTaskRow {
	readonly id: number;
	readonly requestId: number;
	readonly number: string;
	readonly station: WorkRole;
	readonly priority: RequestPriority;
	readonly isStockRequest: boolean;
	readonly deliveryAt: Date | null;
	readonly acceptedAt: Date | null;
	readonly comment: string | null;
	readonly takenAt: Date | null;
	readonly takenByName: string | null;
	readonly completedAt: Date | null;
	readonly unitCount: number;
	readonly doneCount: number;
}

export interface ShopJobRow {
	readonly id: number;
	readonly taskId: number;
	readonly itemId: number;
	readonly variantId: number;
	readonly stockItemId: number | null;
	readonly engraving: string | null;
	readonly comment: string | null;
	readonly qty: number;
	readonly doneQty: number;
}

export interface ProductionMove {
	readonly stockItemId: number;
	readonly optionId: number | null;
	readonly qty: number;
	readonly actorId: number;
	readonly occurredAt: Date;
}

/** What the station screens read and the production move the upholsterer writes (tech.md §20.4). */
export class ShopRepository extends BaseRepository<typeof shopTasks> {
	constructor() {
		super(shopTasks);
	}

	variantTitles(ids: readonly number[]): VariantTitleRow[] {
		if (ids.length === 0) return [];
		return this.db()
			.select({
				id: productVariants.id,
				productTitle: products.title,
				sku: productVariants.sku,
				sizeCode: productVariants.sizeCode,
				materialTitle: dictItems.title,
				stockItemId: productVariants.stockItemId
			})
			.from(productVariants)
			.innerJoin(products, eq(products.id, productVariants.productId))
			.innerJoin(dictItems, eq(dictItems.id, productVariants.materialId))
			.where(inArray(productVariants.id, [...ids]))
			.all();
	}

	optionTitles(ids: readonly number[]): Map<number, string> {
		if (ids.length === 0) return new Map();
		const rows = this.db()
			.select({ id: options.id, title: options.title })
			.from(options)
			.where(inArray(options.id, [...ids]))
			.all();
		return new Map(rows.map((row) => [row.id, row.title]));
	}

	/** Open visits of a station, unordered: the domain orders them; the search goes by number. */
	openTasks(station: WorkRole, search: string | undefined): ShopTaskRow[] {
		return this.tasks(
			and(
				eq(shopTasks.station, station),
				isNull(shopTasks.completedAt),
				search === undefined ? undefined : containsText(requests.number, search)
			)
		);
	}

	task(taskId: number, tx?: Tx): ShopTaskRow | undefined {
		return this.tasks(eq(shopTasks.id, taskId), tx)[0];
	}

	/** Jobs of the visit not past the upholsterer, with the line they make. */
	jobsOf(taskId: number, tx?: Tx): ShopJobRow[] {
		return this.jobs(and(eq(shopJobs.taskId, taskId), isNull(shopJobs.finishedAt)), tx);
	}

	job(jobId: number, tx?: Tx): ShopJobRow | undefined {
		return this.jobs(and(eq(shopJobs.id, jobId), isNull(shopJobs.finishedAt)), tx)[0];
	}

	/** Made for the shelf, not for a request: the fill decides who gets the pieces. */
	insertProduction(move: ProductionMove, tx: Tx): number {
		const [row] = tx
			.insert(stockMoves)
			.values({ ...move, type: 'production', requestId: null })
			.returning({ id: stockMoves.id })
			.all();
		if (!row) throw new Error('failed to write a production move');
		return row.id;
	}

	private tasks(where: ReturnType<typeof and>, tx?: Tx): ShopTaskRow[] {
		const open = isNull(shopJobs.finishedAt);
		return this.db(tx)
			.select({
				id: shopTasks.id,
				requestId: shopTasks.requestId,
				number: requests.number,
				station: shopTasks.station,
				priority: requests.priority,
				isStockRequest: requests.isStockRequest,
				deliveryAt: requests.deliveryAt,
				acceptedAt: requests.acceptedAt,
				comment: requests.comment,
				takenAt: shopTasks.takenAt,
				takenByName: users.fullName,
				completedAt: shopTasks.completedAt,
				unitCount: sql<number>`coalesce(sum(case when ${open} then ${shopJobs.qty} end), 0)`,
				doneCount: sql<number>`coalesce(sum(case when ${open} then ${shopJobs.doneQty} end), 0)`
			})
			.from(shopTasks)
			.innerJoin(requests, eq(requests.id, shopTasks.requestId))
			.leftJoin(users, eq(users.id, shopTasks.takenById))
			.leftJoin(shopJobs, eq(shopJobs.taskId, shopTasks.id))
			.where(where)
			.groupBy(shopTasks.id)
			.all()
			.map((row) => ({
				...row,
				unitCount: Number(row.unitCount),
				doneCount: Number(row.doneCount)
			}));
	}

	private jobs(where: ReturnType<typeof and>, tx?: Tx): ShopJobRow[] {
		return this.db(tx)
			.select({
				id: shopJobs.id,
				taskId: shopJobs.taskId,
				itemId: shopJobs.requestItemId,
				variantId: requestItems.variantId,
				stockItemId: productVariants.stockItemId,
				engraving: requestItems.engraving,
				comment: requestItems.comment,
				qty: shopJobs.qty,
				doneQty: shopJobs.doneQty
			})
			.from(shopJobs)
			.innerJoin(requestItems, eq(requestItems.id, shopJobs.requestItemId))
			.innerJoin(productVariants, eq(productVariants.id, requestItems.variantId))
			.where(where)
			.orderBy(shopJobs.requestItemId)
			.all();
	}
}
