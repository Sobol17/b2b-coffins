import { and, eq, inArray, isNotNull, isNull, notExists, sql } from 'drizzle-orm';
import { BaseRepository } from '../core/repository';
import type { Tx } from '../db/client';
import { requestItems, requests, shopJobs, shopTasks } from '../db/schema';
import type { OpenJob } from '$lib/domain/shop/dispatch';
import type { WorkRole } from '$lib/types/roles';

/** A line of a stock request in work and the pieces the stations already finished for it. */
export interface StockLineRow {
	readonly itemId: number;
	readonly requestId: number;
	readonly qty: number;
	readonly madeQty: number;
}

/** Jobs and visits of the stations, read and written by line (tech.md §5.12). */
export class ShopJobRepository extends BaseRepository<typeof shopJobs> {
	constructor() {
		super(shopJobs);
	}

	/** Pieces past the upholsterer per line of the request: what a stock request counts as made. */
	madeByItem(requestId: number, tx?: Tx): Map<number, number> {
		const rows = this.db(tx)
			.select({ itemId: shopJobs.requestItemId, qty: sql<number>`sum(${shopJobs.qty})` })
			.from(shopJobs)
			.innerJoin(requestItems, eq(requestItems.id, shopJobs.requestItemId))
			.where(and(eq(requestItems.requestId, requestId), isNotNull(shopJobs.finishedAt)))
			.groupBy(shopJobs.requestItemId)
			.all();
		return new Map(rows.map((row) => [row.itemId, Number(row.qty)]));
	}

	/** Every job not yet past the upholsterer, with the station of its visit. */
	openJobs(tx?: Tx): OpenJob[] {
		return this.db(tx)
			.select({
				id: shopJobs.id,
				itemId: shopJobs.requestItemId,
				station: shopTasks.station,
				qty: shopJobs.qty,
				doneQty: shopJobs.doneQty
			})
			.from(shopJobs)
			.innerJoin(shopTasks, eq(shopTasks.id, shopJobs.taskId))
			.where(isNull(shopJobs.finishedAt))
			.all();
	}

	/** Lines of the stock requests in work: they take nothing from the shelf and wait for the shop. */
	stockLines(tx?: Tx): StockLineRow[] {
		const made = sql<number>`coalesce((select sum(${shopJobs.qty}) from ${shopJobs} where ${shopJobs.requestItemId} = ${requestItems.id} and ${shopJobs.finishedAt} is not null), 0)`;
		return this.db(tx)
			.select({
				itemId: requestItems.id,
				requestId: requestItems.requestId,
				qty: requestItems.qty,
				madeQty: made
			})
			.from(requestItems)
			.innerJoin(requests, eq(requests.id, requestItems.requestId))
			.where(and(eq(requests.status, 'in_work'), eq(requests.isStockRequest, true)))
			.all()
			.map((row) => ({ ...row, madeQty: Number(row.madeQty) }));
	}

	openTask(requestId: number, station: WorkRole, tx: Tx): number | undefined {
		const [row] = tx
			.select({ id: shopTasks.id })
			.from(shopTasks)
			.where(
				and(
					eq(shopTasks.requestId, requestId),
					eq(shopTasks.station, station),
					isNull(shopTasks.completedAt)
				)
			)
			.all();
		return row?.id;
	}

	insertTask(requestId: number, station: WorkRole, tx: Tx): number {
		const [row] = tx.insert(shopTasks).values({ requestId, station }).returning().all();
		if (!row) throw new Error('shop task insert returned nothing');
		return row.id;
	}

	openJobIn(taskId: number, itemId: number, tx: Tx): { id: number; qty: number } | undefined {
		const [row] = tx
			.select({ id: shopJobs.id, qty: shopJobs.qty })
			.from(shopJobs)
			.where(
				and(
					eq(shopJobs.taskId, taskId),
					eq(shopJobs.requestItemId, itemId),
					isNull(shopJobs.finishedAt)
				)
			)
			.all();
		return row;
	}

	insertJob(values: { itemId: number; taskId: number; qty: number }, tx: Tx): number {
		const [row] = tx
			.insert(shopJobs)
			.values({ requestItemId: values.itemId, taskId: values.taskId, qty: values.qty })
			.returning()
			.all();
		if (!row) throw new Error('shop job insert returned nothing');
		return row.id;
	}

	setJobQty(jobId: number, qty: number, tx: Tx): void {
		tx.update(shopJobs).set({ qty }).where(eq(shopJobs.id, jobId)).run();
	}

	deleteJobs(jobIds: readonly number[], tx: Tx): void {
		if (jobIds.length === 0) return;
		tx.delete(shopJobs)
			.where(inArray(shopJobs.id, [...jobIds]))
			.run();
	}

	/** «Взять в работу» once: a second press finds the visit taken and changes nothing. */
	takeTask(taskId: number, userId: number, at: Date, tx: Tx): boolean {
		return (
			tx
				.update(shopTasks)
				.set({ takenAt: at, takenById: userId })
				.where(and(eq(shopTasks.id, taskId), isNull(shopTasks.takenAt)))
				.run().changes > 0
		);
	}

	setDone(jobId: number, doneQty: number, tx: Tx): void {
		tx.update(shopJobs).set({ doneQty }).where(eq(shopJobs.id, jobId)).run();
	}

	/** Closes an open visit; false when another press closed it first. */
	closeTask(taskId: number, userId: number, at: Date, tx: Tx): boolean {
		return (
			tx
				.update(shopTasks)
				.set({ completedAt: at, completedById: userId })
				.where(and(eq(shopTasks.id, taskId), isNull(shopTasks.completedAt)))
				.run().changes > 0
		);
	}

	/** The job rides on to the next visit and starts its counter there from zero. */
	moveJob(jobId: number, taskId: number, tx: Tx): void {
		tx.update(shopJobs).set({ taskId, doneQty: 0 }).where(eq(shopJobs.id, jobId)).run();
	}

	finishJob(jobId: number, moveId: number, at: Date, tx: Tx): void {
		tx.update(shopJobs)
			.set({ finishedAt: at, productionMoveId: moveId })
			.where(eq(shopJobs.id, jobId))
			.run();
	}

	/** Open visits the dispatch left without a job: nobody closed them, so nobody is named. */
	closeEmptied(at: Date, tx: Tx): number {
		const jobless = notExists(
			tx.select({ id: shopJobs.id }).from(shopJobs).where(eq(shopJobs.taskId, shopTasks.id))
		);
		return tx
			.update(shopTasks)
			.set({ completedAt: at, completedById: null })
			.where(and(isNull(shopTasks.completedAt), jobless))
			.run().changes;
	}
}
