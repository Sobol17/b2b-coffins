import { ConflictError, NotFoundError, ValidationError } from '../core/errors';
import type { Tx } from '../db/client';
import { StockFillRepository } from '../stock/stock-fill.repository';
import { StockThreshold } from '../stock/stock-threshold';
import { isVisitDone } from './dto';
import { ShopArrivals } from './shop-arrivals';
import { ShopBaseService } from './shop-base.service';
import { ShopFlow } from './shop-flow';
import { ShopJobRepository } from './shop-job.repository';
import { ShopRepository, type ShopJobRow, type ShopTaskRow } from './shop.repository';
import { nextStation } from '$lib/domain/shop/stations';
import type { ActorContext } from '$lib/types/actor';
import type { WorkRole } from '$lib/types/roles';
import type { ShopProgressInput } from '$lib/validation/crm-shop';

const CLOSED = 'Визит уже закрыт, обновите страницу';

/** The acts of a station on a visit (tech.md §20.4): take it, count the pieces, pass it on. */
export class ShopTaskService extends ShopBaseService {
	constructor(
		ctx: ActorContext,
		shop: ShopRepository = new ShopRepository(),
		private readonly jobs: ShopJobRepository = new ShopJobRepository(),
		private readonly arrivals: ShopArrivals = new ShopArrivals(),
		private readonly lines: StockFillRepository = new StockFillRepository(),
		private readonly threshold: StockThreshold = new StockThreshold(),
		private readonly now: () => Date = () => new Date()
	) {
		super(ctx, shop);
	}

	/** «Взять в работу». A taken visit stays with its first taker: a repeat writes nothing. */
	take(taskId: number): void {
		const task = this.requireTask(taskId);
		if (task.completedAt !== null) throw new ConflictError(CLOSED);
		if (task.takenAt !== null) return;
		this.audited({ action: 'shop.task.take', entity: 'shop_tasks' }, (tx) => {
			this.jobs.takeTask(task.id, this.ctx.userId, this.now(), tx);
			return { result: undefined, entityId: task.id };
		});
	}

	/** @throws ValidationError for more than the job holds, ConflictError for a closed visit. */
	progress(input: ShopProgressInput): void {
		this.audited({ action: 'shop.job.progress', entity: 'shop_tasks' }, (tx) => {
			const job = this.shop.job(input.jobId, tx);
			if (!job) throw new NotFoundError('shop job');
			const task = this.requireTask(job.taskId, tx);
			if (task.completedAt !== null) throw new ConflictError(CLOSED);
			if (input.doneQty > job.qty) {
				throw new ValidationError(`Не больше ${job.qty} шт`, { field: 'doneQty' });
			}
			this.jobs.setDone(job.id, input.doneQty, tx);
			return {
				result: undefined,
				entityId: task.id,
				before: { doneQty: job.doneQty },
				after: { jobId: job.id, doneQty: input.doneQty }
			};
		});
	}

	/**
	 * «Выполнено»: the jobs ride on to the next station, or after the upholsterer land on the shelf.
	 * @throws ConflictError for a closed visit or one with pieces left to do.
	 */
	complete(taskId: number): void {
		this.audited({ action: 'shop.task.complete', entity: 'shop_tasks' }, (tx) => {
			const task = this.requireTask(taskId, tx);
			if (task.completedAt !== null) throw new ConflictError(CLOSED);
			const jobs = this.shop.jobsOf(task.id, tx);
			if (!isVisitDone(jobs)) throw new ConflictError('Отметьте все позиции визита');
			if (!this.jobs.closeTask(task.id, this.ctx.userId, this.now(), tx)) {
				throw new ConflictError(CLOSED);
			}
			const next = nextStation(task.station);
			const moveIds = next === null ? this.shelve(jobs, tx) : this.pass(task, jobs, next, tx);
			return {
				result: undefined,
				entityId: task.id,
				after: { jobIds: jobs.map((job) => job.id), next, moveIds }
			};
		});
	}

	private pass(task: ShopTaskRow, jobs: readonly ShopJobRow[], next: WorkRole, tx: Tx): number[] {
		for (const job of jobs) {
			this.arrivals.forward({ ...job, requestId: task.requestId }, next, tx);
		}
		return [];
	}

	/** Made for the shelf, not for the request: the fill hands the pieces out (tech.md §20.4). */
	private shelve(jobs: readonly ShopJobRow[], tx: Tx): number[] {
		const at = this.now();
		const colours = this.lines.colours(
			jobs.map((job) => job.itemId),
			tx
		);
		const moveIds = jobs.map((job) => {
			if (job.stockItemId === null) {
				throw new ConflictError('У варианта нет складской позиции, свяжите её в каталоге');
			}
			const moveId = this.shop.insertProduction(
				{
					stockItemId: job.stockItemId,
					optionId: colours.get(job.itemId) ?? null,
					qty: job.qty,
					actorId: this.ctx.userId,
					occurredAt: at
				},
				tx
			);
			this.jobs.finishJob(job.id, moveId, at, tx);
			this.threshold.watch(job.stockItemId, tx, at);
			return moveId;
		});
		ShopFlow.afterChange(this.ctx, tx);
		return moveIds;
	}
}
