import { offsetFor } from '../core/list';
import { OrgService } from '../settings/org.service';
import { PortalRequestService } from './portal-request.service';
import { RegistryDtoMapper } from './registry.dto';
import { RequestRegistryRepository, type RegistryQuery } from './request-registry.repository';
import { ACTIVE_STATUSES, dateWindow, sortFor } from '$lib/domain/request/registry';
import type { ActorContext } from '$lib/types/actor';
import type { ListQuery } from '$lib/types/list';
import {
	REQUEST_STATUSES,
	type RequestFilters,
	type RequestListPageDto,
	type RequestStatus
} from '$lib/types/request';

/** The registry of sent requests behind `/portal/requests` (tech.md 14, P6). */
export class RequestRegistryService extends PortalRequestService {
	constructor(
		ctx: ActorContext,
		private readonly repo: RequestRegistryRepository = new RequestRegistryRepository(),
		private readonly timeZone: string = OrgService.timezone()
	) {
		super(ctx);
	}

	/** @throws ForbiddenError for a role outside the portal contour. */
	list(query: ListQuery<RequestFilters>): RequestListPageDto {
		this.requireReader();
		const params = this.params(query);
		const rows = this.repo.page(this.ctx, params);
		const summaries = this.repo.summaries(rows.map((row) => row.id));
		return {
			rows: rows.map((row) => RegistryDtoMapper.toListItem(row, summaries.get(row.id))),
			total: this.repo.total(this.ctx, params),
			page: query.page,
			perPage: query.perPage,
			countsByStatus: this.counts(params)
		};
	}

	/**
	 * The active requests of the portal home: what the counterparty is waiting for right now. The
	 * total counts past the limit, so the heading tells how many are in work.
	 */
	active(limit: number): Pick<RequestListPageDto, 'rows' | 'total'> {
		this.requireReader();
		const { rows, total } = this.list({
			page: 1,
			perPage: limit,
			filters: { statuses: ACTIVE_STATUSES }
		});
		return { rows, total };
	}

	private params(query: ListQuery<RequestFilters>): RegistryQuery {
		const filters = query.filters ?? {};
		return {
			ownOnly: !this.seesWholeCounterparty(),
			statuses: filters.statuses ?? [],
			window: dateWindow(filters, this.timeZone),
			search: query.search,
			sort: sortFor(query.sort, this.ctx.canSeePrices),
			dir: query.dir ?? 'desc',
			limit: query.perPage,
			offset: offsetFor(query)
		};
	}

	private counts(params: RegistryQuery): Record<RequestStatus, number> {
		const counted = this.repo.countsByStatus(this.ctx, params);
		return Object.fromEntries(
			REQUEST_STATUSES.map((status) => [status, counted.get(status) ?? 0])
		) as Record<RequestStatus, number>;
	}
}
