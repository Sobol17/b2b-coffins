import type { RegistryRow, RegistrySummary } from './request-registry.repository';
import type { RequestListItemDto } from '$lib/types/request';
import { definedProps } from '$lib/utils/props';

/** Role projection of a registry row (tech.md 8.1): money keys exist only when the row carries them. */
export class RegistryDtoMapper {
	static toListItem(row: RegistryRow, summary: RegistrySummary | undefined): RequestListItemDto {
		return {
			id: row.id,
			number: row.number,
			status: row.status,
			priority: row.priority,
			// The portal shows one counterparty, its own: the name belongs to the CRM registry (C4).
			counterpartyName: null,
			itemCount: summary?.itemCount ?? 0,
			unitCount: summary?.unitCount ?? 0,
			firstItemTitle: summary?.firstItemTitle ?? null,
			authorName: row.authorName,
			externalNumber: row.externalNumber,
			createdAt: row.createdAt.toISOString(),
			submittedAt: row.submittedAt?.toISOString() ?? null,
			readyAt: row.readyAt?.toISOString() ?? null,
			deliveredAt: row.deliveredAt?.toISOString() ?? null,
			...definedProps({ totalMinor: row.totalMinor, paidMinor: row.paidMinor })
		};
	}
}
