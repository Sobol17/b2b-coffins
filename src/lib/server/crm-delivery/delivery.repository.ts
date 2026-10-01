import { and, eq, inArray, sql } from 'drizzle-orm';
import { countExpression } from '../core/list';
import { BaseRepository } from '../core/repository';
import { counterparties, deliveryAddresses, requests } from '../db/schema';
import { BOARD_ORDER } from '../crm-request/crm-request-query';
import type { RequestPriority } from '$lib/types/request';

export type StopStatus = 'in_work' | 'ready';

export interface StopRow {
	readonly id: number;
	readonly number: string;
	readonly status: StopStatus;
	readonly priority: RequestPriority;
	readonly counterpartyName: string | null;
	readonly externalNumber: string | null;
	readonly deceasedName: string | null;
	readonly deliveryAt: Date | null;
	readonly address: string | null;
	readonly lat: number | null;
	readonly lon: number | null;
	readonly contactName: string | null;
	readonly contactPhone: string | null;
	readonly counterpartyPhone: string | null;
}

/**
 * What the delivery screen reads (tech.md v1.43): counterparty requests on their way to the door.
 * A stock request stays on the shelf, so it never shows up here.
 */
export class DeliveryRepository extends BaseRepository<typeof requests> {
	constructor() {
		super(requests);
	}

	/** Requests of one status in the order the workshop serves them: urgent, then the deadline. */
	stops(status: StopStatus, limit: number): StopRow[] {
		return this.db()
			.select({
				id: requests.id,
				number: requests.number,
				status: sql<StopStatus>`${requests.status}`,
				priority: requests.priority,
				counterpartyName: counterparties.name,
				externalNumber: requests.externalNumber,
				deceasedName: requests.deceasedName,
				deliveryAt: requests.deliveryAt,
				address: deliveryAddresses.address,
				lat: deliveryAddresses.lat,
				lon: deliveryAddresses.lon,
				contactName: deliveryAddresses.contactName,
				contactPhone: deliveryAddresses.contactPhone,
				counterpartyPhone: counterparties.phone
			})
			.from(requests)
			.leftJoin(counterparties, eq(counterparties.id, requests.counterpartyId))
			.leftJoin(deliveryAddresses, eq(deliveryAddresses.id, requests.deliveryAddressId))
			.where(this.onTheWay(status))
			.orderBy(...BOARD_ORDER)
			.limit(limit)
			.all();
	}

	count(status: StopStatus): number {
		const [row] = this.db()
			.select({ count: countExpression })
			.from(requests)
			.where(this.onTheWay(status))
			.all();
		return row?.count ?? 0;
	}

	/** The total of each request: the driver takes it whole or not at all (tech.md v1.44). */
	totals(ids: readonly number[]): Map<number, number> {
		if (ids.length === 0) return new Map();
		const rows = this.db()
			.select({ id: requests.id, totalMinor: requests.totalMinor })
			.from(requests)
			.where(inArray(requests.id, [...ids]))
			.all();
		return new Map(rows.map((row) => [row.id, row.totalMinor]));
	}

	private onTheWay(status: StopStatus) {
		return and(eq(requests.status, status), eq(requests.isStockRequest, false));
	}
}
