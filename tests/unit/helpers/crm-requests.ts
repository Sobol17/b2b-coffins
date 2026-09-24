import { database } from '../../../src/lib/server/db/client';
import { requestAssignees, requests } from '../../../src/lib/server/db/schema';
import { normalizeListQuery } from '../../../src/lib/server/core/list';
import type { AssigneeRole, CrmRequestFilters } from '../../../src/lib/types/crm-request';
import type { ListQuery } from '../../../src/lib/types/list';
import type { RequestPriority, RequestStatus } from '../../../src/lib/types/request';

let sequence = 0;

export interface RequestFixture {
	readonly status: RequestStatus;
	readonly counterpartyId: number | null;
	readonly createdById: number;
	readonly priority?: RequestPriority;
	readonly deliveryAt?: Date | null;
	readonly deliveredAt?: Date | null;
	readonly paidAt?: Date | null;
	readonly totalMinor?: number;
	readonly deceasedName?: string | null;
	readonly number?: string;
}

/** A request written as a fixture: the board reads statuses other slices move it into. */
export function insertRequest(fixture: RequestFixture): number {
	sequence += 1;
	const [row] = database
		.insert(requests)
		.values({
			number: fixture.number ?? `Т-${String(sequence).padStart(5, '0')}`,
			counterpartyId: fixture.counterpartyId,
			isStockRequest: fixture.counterpartyId === null,
			createdById: fixture.createdById,
			status: fixture.status,
			priority: fixture.priority ?? 'normal',
			deliveryAt: fixture.deliveryAt ?? null,
			deliveredAt: fixture.deliveredAt ?? null,
			paidAt: fixture.paidAt ?? null,
			totalMinor: fixture.totalMinor ?? 100_00,
			deceasedName: fixture.deceasedName ?? null,
			submittedAt: fixture.status === 'draft' ? null : new Date()
		})
		.returning({ id: requests.id })
		.all();
	if (!row) throw new Error('failed to insert a request');
	return row.id;
}

export function crew(requestId: number, userId: number, role: AssigneeRole): void {
	database.insert(requestAssignees).values({ requestId, userId, role }).run();
}

export function crmQuery(
	filters: CrmRequestFilters = {},
	extra: Partial<ListQuery<CrmRequestFilters>> = {}
): ListQuery<CrmRequestFilters> {
	return normalizeListQuery<CrmRequestFilters>({ perPage: 100, ...extra, filters });
}
