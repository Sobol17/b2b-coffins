import { eq } from 'drizzle-orm';
import { seedSettings } from '../../../scripts/seed/reference';
import type { Db } from '../../../src/lib/server/db/client';
import { charityTotals, jobQueue, requests, settings } from '../../../src/lib/server/db/schema';
import { DraftService } from '../../../src/lib/server/request/draft.service';
import { RequestSubmitService } from '../../../src/lib/server/request/request-submit.service';
import type { ActorContext } from '../../../src/lib/types/actor';
import type { RequestStatus } from '../../../src/lib/types/request';
import { insertUser } from './db';
import { crmActor, portalActor, seedOrderingWorld, variantId } from './portal-requests';
import { assign, move } from './transitions';

const pickup = { deliveryAddressId: null, isPickup: true, comment: null, externalNumber: null };

/** The ordering world of P4 plus the workshop crew and the seeded settings, rate 100 bp. */
export function seedCharityWorld(db: Db) {
	const world = seedOrderingWorld(db);
	seedSettings(db);
	const ids = {
		manager: insertUser({ email: 'mgr@fund.example', role: 'manager', counterpartyId: null }),
		carpenter: insertUser({ email: 'carp@fund.example', role: 'carpenter', counterpartyId: null }),
		driver: insertUser({ email: 'drv@fund.example', role: 'driver', counterpartyId: null })
	};
	const actors = {
		admin: portalActor('cp_admin', world.adminId, world.cpId),
		employee: portalActor('cp_employee', world.employeeId, world.cpId),
		outsider: portalActor('cp_admin', world.outsiderId, world.otherCpId),
		manager: crmActor('manager', ids.manager),
		carpenter: crmActor('carpenter', ids.carpenter),
		driver: crmActor('driver', ids.driver)
	};
	const variant = variantId(db, 'MDL-201-180-PIN');

	function sent(by: ActorContext = actors.admin, qty = 2): number {
		new DraftService(by).addItem({ variantId: variant, qty, optionIds: [] });
		return new RequestSubmitService(by).submit(pickup).id;
	}

	/** Walks a sent request forward to `upTo` the way P5 allows it. */
	function drive(id: number, upTo: Extract<RequestStatus, 'in_work' | 'ready' | 'delivered'>) {
		assign(id, ids.carpenter, 'carpenter');
		assign(id, ids.driver, 'driver');
		move(actors.manager, id, 'in_work');
		if (upTo === 'in_work') return;
		move(actors.carpenter, id, 'ready');
		if (upTo === 'ready') return;
		move(actors.driver, id, 'delivered');
	}

	return { world, ids, actors, sent, drive };
}

export function setRate(db: Db, rateBp: unknown): void {
	db.update(settings).set({ value: rateBp }).where(eq(settings.key, 'charity.rate_bp')).run();
}

export function charityOf(db: Db, id: number) {
	const [row] = db
		.select({
			status: requests.status,
			totalMinor: requests.totalMinor,
			rateBp: requests.charityRateBp,
			amountMinor: requests.charityAmountMinor
		})
		.from(requests)
		.where(eq(requests.id, id))
		.all();
	if (!row) throw new Error(`request ${id} not found`);
	return row;
}

export function recountJobs(db: Db) {
	return db
		.select({ key: jobQueue.idempotencyKey, payload: jobQueue.payload, status: jobQueue.status })
		.from(jobQueue)
		.where(eq(jobQueue.topic, 'charity.recount'))
		.orderBy(jobQueue.id)
		.all();
}

export function totalsRow(db: Db, scope: string) {
	return db
		.select({ amountMinor: charityTotals.amountMinor, requestCount: charityTotals.requestCount })
		.from(charityTotals)
		.where(eq(charityTotals.scope, scope))
		.all();
}
