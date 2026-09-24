import { RegistryDtoMapper } from '../request/registry.dto';
import type { RegistrySummary } from '../request/request-registry.repository';
import type { CrmListRow } from './crm-request-list.repository';
import { attentionFlags } from '$lib/domain/request/attention';
import type { CrmRequestListItemDto } from '$lib/types/crm-request';

/** Role projection of a workshop list row (tech.md 8.1): money keys only when the row has them. */
export class CrmRequestDtoMapper {
	static toListItem(
		row: CrmListRow,
		summary: RegistrySummary | undefined,
		now: Date
	): CrmRequestListItemDto {
		return {
			...RegistryDtoMapper.toListItem(row, summary),
			counterpartyName: row.counterpartyName,
			counterpartyId: row.counterpartyId,
			isStockRequest: row.isStockRequest,
			deliveryAt: row.deliveryAt?.toISOString() ?? null,
			flags: attentionFlags(
				{
					status: row.status,
					deliveredAt: row.deliveredAt,
					scheme: row.isStockRequest ? null : row.scheme
				},
				now
			)
		};
	}
}
