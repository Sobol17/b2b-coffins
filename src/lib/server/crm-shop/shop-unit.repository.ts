import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { BaseRepository } from '../core/repository';
import { ConflictError } from '../core/errors';
import type { Tx } from '../db/client';
import {
	productVariants,
	products,
	requestItems,
	requests,
	shopJobs,
	shopTasks,
	shopUnits,
	shopUnitWorks,
	staff
} from '../db/schema';
import type { ActorContext } from '$lib/types/actor';
import type { ShopUnitDto } from '$lib/types/crm-shop';
import type { WorkRole } from '$lib/types/roles';

/** Physical pieces survive job merges and keep their own station history. */
export class ShopUnitRepository extends BaseRepository<typeof shopUnits> {
	constructor() {
		super(shopUnits);
	}

	find(id: number, tx?: Tx) {
		return this.db(tx)
			.select({
				id: shopUnits.id,
				jobId: shopJobs.id,
				taskId: shopTasks.id,
				station: shopTasks.station,
				completedAt: shopTasks.completedAt,
				finishedAt: shopJobs.finishedAt,
				variantId: requestItems.variantId,
				legacyDone: shopUnits.legacyDone
			})
			.from(shopUnits)
			.innerJoin(shopJobs, eq(shopJobs.id, shopUnits.jobId))
			.innerJoin(shopTasks, eq(shopTasks.id, shopJobs.taskId))
			.innerJoin(requestItems, eq(requestItems.id, shopJobs.requestItemId))
			.where(eq(shopUnits.id, id))
			.get();
	}

	/** Called by arrivals in the surrounding business transaction. */
	resize(jobId: number, qty: number, tx: Tx): void {
		const pieces = tx
			.select()
			.from(shopUnits)
			.where(eq(shopUnits.jobId, jobId))
			.orderBy(asc(shopUnits.id))
			.all();
		if (pieces.length > qty) {
			const free = pieces
				.filter((p) => !p.legacyDone && !this.hasWork(p.id, tx))
				.slice(qty - pieces.length);
			if (free.length !== pieces.length - qty)
				throw new ConflictError('Взятые изделия нельзя снять с производства');
			tx.delete(shopUnits)
				.where(
					inArray(
						shopUnits.id,
						free.map((p) => p.id)
					)
				)
				.run();
		} else if (pieces.length < qty) {
			const row = tx
				.select({ itemId: shopJobs.requestItemId, title: products.title, number: requests.number })
				.from(shopJobs)
				.innerJoin(requestItems, eq(requestItems.id, shopJobs.requestItemId))
				.innerJoin(requests, eq(requests.id, requestItems.requestId))
				.innerJoin(productVariants, eq(productVariants.id, requestItems.variantId))
				.innerJoin(products, eq(products.id, productVariants.productId))
				.where(eq(shopJobs.id, jobId))
				.get();
			if (!row) throw new Error('missing job for units');
			tx.insert(shopUnits)
				.values(
					Array.from({ length: qty - pieces.length }, () => ({
						jobId,
						requestItemId: row.itemId,
						productTitle: row.title,
						requestNumber: row.number
					}))
				)
				.run();
		}
	}

	move(sourceJobId: number, targetJobId: number, tx: Tx): void {
		tx.update(shopUnits)
			.set({ jobId: targetJobId, legacyDone: false })
			.where(eq(shopUnits.jobId, sourceJobId))
			.run();
	}

	reset(jobId: number, tx: Tx): void {
		tx.update(shopUnits).set({ legacyDone: false }).where(eq(shopUnits.jobId, jobId)).run();
	}

	/** Administrative counting never invents an executor or earnings. */
	manual(jobId: number, qty: number, tx: Tx, station: WorkRole): void {
		const pieces = tx
			.select()
			.from(shopUnits)
			.where(eq(shopUnits.jobId, jobId))
			.orderBy(asc(shopUnits.id))
			.all();
		if (pieces.some((p) => this.hasWork(p.id, tx, station)))
			throw new ConflictError('Изменяйте выполнение по конкретным изделиям');
		for (let i = 0; i < pieces.length; i++)
			tx.update(shopUnits)
				.set({ legacyDone: i < qty })
				.where(eq(shopUnits.id, pieces[i]!.id))
				.run();
	}

	assertRemovableItem(itemId: number, tx: Tx): void {
		const pieces = tx.select().from(shopUnits).where(eq(shopUnits.requestItemId, itemId)).all();
		if (pieces.some((p) => p.legacyDone || this.hasWork(p.id, tx)))
			throw new ConflictError('По позиции уже работают. Удалить её нельзя');
		if (pieces.length)
			tx.delete(shopUnits)
				.where(
					inArray(
						shopUnits.id,
						pieces.map((p) => p.id)
					)
				)
				.run();
	}

	done(jobId: number, station: WorkRole, tx: Tx): number {
		const row = tx
			.select({ count: sql<number>`count(*)` })
			.from(shopUnits)
			.leftJoin(
				shopUnitWorks,
				and(eq(shopUnitWorks.unitId, shopUnits.id), eq(shopUnitWorks.station, station))
			)
			.where(
				and(
					eq(shopUnits.jobId, jobId),
					sql`(${shopUnits.legacyDone} = 1 or ${shopUnitWorks.completedAt} is not null)`
				)
			)
			.get();
		return row?.count ?? 0;
	}

	dtos(
		jobIds: readonly number[],
		station: WorkRole,
		actor: ActorContext
	): Map<number, ShopUnitDto[]> {
		const result = new Map<number, ShopUnitDto[]>();
		if (!jobIds.length) return result;
		const rows = this.unitRows(jobIds, station);
		const head = actor.roles.includes('owner') || actor.roles.includes('manager');
		for (const row of rows) {
			if (row.jobId === null) continue;
			const done = row.legacy || row.completedAt !== null;
			const dto = {
				id: row.id,
				takenByName: row.fullName,
				takenById: row.userId,
				completedAt: row.completedAt?.toISOString() ?? null,
				isLegacyDone: row.legacy,
				canTake: !done && row.workId === null,
				canComplete: !done && row.workId !== null && (head || row.userId === actor.userId)
			};
			result.set(row.jobId, [...(result.get(row.jobId) ?? []), dto]);
		}
		return result;
	}

	private unitRows(jobIds: readonly number[], station: WorkRole) {
		return this.db()
			.select({
				id: shopUnits.id,
				jobId: shopUnits.jobId,
				legacy: shopUnits.legacyDone,
				completedAt: shopUnitWorks.completedAt,
				workId: shopUnitWorks.id,
				userId: staff.userId,
				fullName: staff.fullName
			})
			.from(shopUnits)
			.leftJoin(
				shopUnitWorks,
				and(eq(shopUnitWorks.unitId, shopUnits.id), eq(shopUnitWorks.station, station))
			)
			.leftJoin(staff, eq(staff.id, shopUnitWorks.staffId))
			.where(inArray(shopUnits.jobId, [...jobIds]))
			.orderBy(asc(shopUnits.id))
			.all();
	}

	private hasWork(unitId: number, tx: Tx, station?: WorkRole): boolean {
		return (
			tx
				.select({ id: shopUnitWorks.id })
				.from(shopUnitWorks)
				.where(
					and(
						eq(shopUnitWorks.unitId, unitId),
						station === undefined ? undefined : eq(shopUnitWorks.station, station)
					)
				)
				.get() !== undefined
		);
	}
}
