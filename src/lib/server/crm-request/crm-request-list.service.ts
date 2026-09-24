import { offsetFor } from '../core/list';
import { RequestRegistryRepository } from '../request/request-registry.repository';
import { OrgService } from '../settings/org.service';
import { CrmRequestBaseService } from './crm-request-base.service';
import { CrmRequestChoicesRepository } from './crm-request-choices.repository';
import {
	CrmRequestListRepository,
	type CrmListRow,
	type ListSlice
} from './crm-request-list.repository';
import type { CrmRequestCriteria } from './crm-request-query';
import { CrmRequestDtoMapper } from './dto';
import { dateWindow } from '$lib/domain/request/registry';
import type { ActorContext } from '$lib/types/actor';
import {
	BOARD_COLUMN_LIMIT,
	BOARD_PAID_DAYS,
	BOARD_STATUSES,
	CRM_REQUEST_EXPORT_LIMIT,
	CRM_REQUEST_SORTS,
	type CrmBoardDto,
	type CrmRequestChoicesDto,
	type CrmRequestFilters,
	type CrmRequestListItemDto,
	type CrmRequestSort
} from '$lib/types/crm-request';
import type { ListQuery, Page } from '$lib/types/list';

const DAY_MS = 86_400_000;

/** Registry, board and export rows of the workshop (tech.md 14, C4). */
export class CrmRequestListService extends CrmRequestBaseService {
	constructor(
		ctx: ActorContext,
		private readonly repo: CrmRequestListRepository = new CrmRequestListRepository(),
		private readonly registry: RequestRegistryRepository = new RequestRegistryRepository(),
		private readonly choices: CrmRequestChoicesRepository = new CrmRequestChoicesRepository(),
		private readonly timeZone: string = OrgService.timezone(),
		private readonly now: () => Date = () => new Date()
	) {
		super(ctx);
	}

	/** The counterparty filter of the board and the registry. */
	counterparties(): CrmRequestChoicesDto['counterparties'] {
		return this.choices.counterparties();
	}

	list(query: ListQuery<CrmRequestFilters>): Page<CrmRequestListItemDto> {
		const criteria = this.criteria(query);
		const rows = this.repo.page(criteria, this.slice(query), this.ctx.canSeePrices);
		return {
			rows: this.project(rows, criteria.now),
			total: this.repo.total(criteria),
			page: query.page,
			perPage: query.perPage
		};
	}

	/** Six columns of the main flow; the status filter of the registry means nothing here. */
	board(query: Pick<ListQuery<CrmRequestFilters>, 'filters' | 'search'>): CrmBoardDto {
		const criteria = this.criteria({ ...query, filters: { ...query.filters, status: undefined } });
		const paidSince = new Date(criteria.now.getTime() - BOARD_PAID_DAYS * DAY_MS);
		const totals = this.repo.columnTotals(criteria, BOARD_STATUSES, paidSince);
		return {
			columns: BOARD_STATUSES.map((status) => ({
				status,
				total: totals.get(status) ?? 0,
				cards: this.project(
					this.repo.column(criteria, status, paidSince, BOARD_COLUMN_LIMIT, this.ctx.canSeePrices),
					criteria.now
				)
			}))
		};
	}

	/** The registry as it is filtered and sorted, without paging, up to the export limit. */
	exportRows(query: ListQuery<CrmRequestFilters>): CrmRequestListItemDto[] {
		const criteria = this.criteria(query);
		const slice = { ...this.slice(query), limit: CRM_REQUEST_EXPORT_LIMIT, offset: 0 };
		return this.project(this.repo.page(criteria, slice, this.ctx.canSeePrices), criteria.now);
	}

	private criteria(
		query: Pick<ListQuery<CrmRequestFilters>, 'filters' | 'search'>
	): CrmRequestCriteria {
		const { from, to, ...filters } = query.filters ?? {};
		return {
			filters,
			window: dateWindow(
				{ ...(from === undefined ? {} : { from }), ...(to === undefined ? {} : { to }) },
				this.timeZone
			),
			search: query.search,
			now: this.now()
		};
	}

	/** A role without prices never sorts by money: the order would tell the amounts apart. */
	private slice(query: ListQuery<CrmRequestFilters>): ListSlice {
		const known = CRM_REQUEST_SORTS.find((sort) => sort === query.sort);
		const sort: CrmRequestSort =
			known === undefined || (known === 'total' && !this.ctx.canSeePrices) ? 'submittedAt' : known;
		return { sort, dir: query.dir ?? 'desc', limit: query.perPage, offset: offsetFor(query) };
	}

	private project(rows: readonly CrmListRow[], now: Date): CrmRequestListItemDto[] {
		const ids = rows.map((row) => row.id);
		const summaries = this.registry.summaries(ids);
		const crew = this.repo.assignees(ids);
		return rows.map((row) =>
			CrmRequestDtoMapper.toListItem(
				row,
				summaries.get(row.id),
				crew.filter((member) => member.requestId === row.id),
				now
			)
		);
	}
}
