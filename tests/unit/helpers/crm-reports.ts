import { eq } from 'drizzle-orm';
import type { Db } from '../../../src/lib/server/db/client';
import { requests } from '../../../src/lib/server/db/schema';
import { RequestTransitionService } from '../../../src/lib/server/request/request-transition.service';
import { seedDeliveryWorld } from './crm-delivery';

/** The delivery world of C6 seen by the owner: reports read what the crew has done. */
export function seedReportWorld(db: Db) {
	const base = seedDeliveryWorld(db);

	/** A counterparty request handed over without cash; `at` moves the delivery into a period. */
	function delivered(qty = 2, at?: Date): number {
		const id = base.assembled(qty);
		const line = base.lineOf(id);
		base.delivery().load({ itemId: line.itemId, qty: line.qty });
		new RequestTransitionService(base.actors.driver).deliver(id, false);
		if (at) db.update(requests).set({ deliveredAt: at }).where(eq(requests.id, id)).run();
		return id;
	}

	return { ...base, owner: base.actors.owner, delivered };
}
