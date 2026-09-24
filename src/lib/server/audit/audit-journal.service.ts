import { PolicyService } from '../auth/policy';
import { BaseService } from '../core/service';
import { OrgService } from '../settings/org.service';
import { AuditRepository } from './audit.repository';
import { dateWindow } from '$lib/domain/request/registry';
import type { ActorContext } from '$lib/types/actor';
import type { AuditEntryDto, AuditFilters } from '$lib/types/crm';
import type { ListQuery, Page } from '$lib/types/list';
import { definedProps } from '$lib/utils/props';

export interface AuditJournalDto extends Page<AuditEntryDto> {
	readonly actions: string[];
	readonly entities: string[];
}

/** The audit journal of the CRM (C1): who changed what, when and from which value. Owner only. */
export class AuditJournalService extends BaseService {
	constructor(
		ctx: ActorContext,
		private readonly repo: AuditRepository = new AuditRepository()
	) {
		super(ctx);
		this.assert(PolicyService.can(ctx, 'audit.read') && ctx.scope === 'crm', 'audit.read');
	}

	list(query: ListQuery<AuditFilters>): AuditJournalDto {
		// The window is a calendar day of the workshop, not of the server, like the request registry.
		const range = definedProps({ from: query.filters?.from, to: query.filters?.to });
		const window = dateWindow(range, OrgService.timezone());
		const { rows, total } = this.repo.list({ ...query, window });
		return {
			rows: rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })),
			total,
			page: query.page,
			perPage: query.perPage,
			actions: this.repo.distinct('action'),
			entities: this.repo.distinct('entity')
		};
	}
}
