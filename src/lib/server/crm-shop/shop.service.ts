import { PolicyService } from '../auth/policy';
import { ForbiddenError } from '../core/errors';
import { StockFillRepository } from '../stock/stock-fill.repository';
import { PositionTitles, ShopDtoMapper } from './dto';
import { ShopBaseService } from './shop-base.service';
import { ShopRepository } from './shop.repository';
import { stationOrder } from '$lib/domain/shop/stations';
import type { ActorContext } from '$lib/types/actor';
import {
	SHOP_TASK_LIMIT,
	type ShopDto,
	type ShopStationDto,
	type ShopTaskDto
} from '$lib/types/crm-shop';
import type { WorkRole } from '$lib/types/roles';

export interface ShopQuery {
	readonly search?: string;
	readonly station?: WorkRole;
}

/** What a station sees (tech.md §20.4): its visits in order and one visit with its jobs. */
export class ShopService extends ShopBaseService {
	constructor(
		ctx: ActorContext,
		shop: ShopRepository = new ShopRepository(),
		private readonly lines: StockFillRepository = new StockFillRepository()
	) {
		super(ctx, shop);
	}

	/** @throws ForbiddenError for a station the actor does not work. */
	overview(query: ShopQuery): ShopDto {
		const own = PolicyService.stationsOf(this.ctx);
		if (query.station !== undefined && !own.includes(query.station)) {
			throw new ForbiddenError('shop.work');
		}
		const stations = query.station === undefined ? own : [query.station];
		return { stations: stations.map((station) => this.station(station, query.search)) };
	}

	/** @throws NotFoundError for an unknown visit, ForbiddenError for one of another station. */
	task(taskId: number): ShopTaskDto {
		const task = this.requireTask(taskId);
		const jobs = this.shop.jobsOf(task.id);
		const colours = this.lines.colours(jobs.map((job) => job.itemId));
		const titles = PositionTitles.read(
			this.shop,
			jobs.map((job) => ({ variantId: job.variantId, optionId: colours.get(job.itemId) ?? null }))
		);
		return ShopDtoMapper.toTask(task, jobs, colours, titles);
	}

	private station(station: WorkRole, search: string | undefined): ShopStationDto {
		const rows = this.shop
			.openTasks(station, search)
			.sort((a, b) =>
				stationOrder(
					{ ...a, isUrgent: a.priority === 'urgent' },
					{ ...b, isUrgent: b.priority === 'urgent' }
				)
			);
		const list = (taken: boolean) =>
			rows
				.filter((row) => (row.takenAt !== null) === taken)
				.slice(0, SHOP_TASK_LIMIT)
				.map(ShopDtoMapper.toListItem);
		return { station, fresh: list(false), taken: list(true), total: rows.length };
	}
}
