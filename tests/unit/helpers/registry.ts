import { eq } from 'drizzle-orm';
import { database } from '../../../src/lib/server/db/client';
import { requests } from '../../../src/lib/server/db/schema';
import { DraftService } from '../../../src/lib/server/request/draft.service';
import { RequestSubmitService } from '../../../src/lib/server/request/request-submit.service';
import { normalizeListQuery } from '../../../src/lib/server/core/list';
import type { ActorContext } from '../../../src/lib/types/actor';
import type { ListQuery } from '../../../src/lib/types/list';
import type { RequestFilters } from '../../../src/lib/types/request';
import type { DraftDetailsInput } from '../../../src/lib/validation/request';

const PICKUP: DraftDetailsInput = {
	deliveryAddressId: null,
	isPickup: true,
	comment: null
};

/** One sent request of the actor: the registry only ever lists requests that left the cart. */
export function send(
	ctx: ActorContext,
	variantId: number,
	shipment: Partial<DraftDetailsInput> = {},
	qty = 2
): number {
	new DraftService(ctx).addItem({ variantId, qty, optionIds: [] });
	return new RequestSubmitService(ctx).submit({ ...PICKUP, ...shipment }).id;
}

/** The own number of the counterparty comes from data written before the field left the cart. */
export function markExternal(requestId: number, externalNumber: string): void {
	database.update(requests).set({ externalNumber }).where(eq(requests.id, requestId)).run();
}

/** The moment of sending is what the period filter reads, so a test writes it by hand. */
export function sentAt(requestId: number, at: string): void {
	database
		.update(requests)
		.set({ submittedAt: new Date(at) })
		.where(eq(requests.id, requestId))
		.run();
}

export function listQuery(filters: RequestFilters = {}): ListQuery<RequestFilters> {
	return normalizeListQuery<RequestFilters>({ filters });
}
