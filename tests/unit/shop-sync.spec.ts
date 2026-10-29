import { beforeEach, describe, expect, it } from 'vitest';
import { shopSync } from '../../scripts/admin/shop';
import { shopJobs, shopTasks, stockMoves } from '../../src/lib/server/db/schema';
import { seedShopWorld } from './helpers/crm-shop';
import { migratedDatabase } from './helpers/db';
import { resetRequests } from './helpers/portal-requests';
import { statusOf } from './helpers/transitions';

const db = migratedDatabase();
const { inWork, jobsOf, stockItemId, walnut } = seedShopWorld(db, 'c19c');

/** A stand from before C19: requests in work and no station has heard of them. */
function beforeStations(): void {
	db.delete(shopJobs).run();
	db.delete(shopTasks).run();
}

beforeEach(() => resetRequests(db));

describe('pnpm admin shop:sync (tech.md §2)', () => {
	it('sends the pieces of requests accepted before the stations, once', () => {
		const id = inWork(2);
		beforeStations();

		expect(shopSync(db)).toEqual({ pieces: 2, ready: 0 });
		expect(jobsOf(id).map((job) => [job.station, job.qty])).toEqual([['carpenter', 2]]);
		expect(shopSync(db)).toEqual({ pieces: 0, ready: 0 });
	});

	it('readies a request the shelf already covers', () => {
		const id = inWork(1);
		beforeStations();
		db.insert(stockMoves)
			.values({ stockItemId, optionId: walnut, qty: 1, type: 'purchase', occurredAt: new Date() })
			.run();
		expect(statusOf(id)).toBe('in_work');

		expect(shopSync(db)).toEqual({ pieces: 0, ready: 1 });
		expect(statusOf(id)).toBe('ready');
	});
});
