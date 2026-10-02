import pino from 'pino';
import { beforeEach, describe, expect, it } from 'vitest';
import { ShopService } from '../../src/lib/server/crm-shop/shop.service';
import { InventoryService } from '../../src/lib/server/crm-stock/inventory.service';
import { StockMoveService } from '../../src/lib/server/crm-stock/stock-move.service';
import { backoffSeconds } from '../../src/lib/server/queue/backoff';
import { InvalidPayloadError } from '../../src/lib/server/queue/job-handler';
import { createStockThresholdCheckHandler } from '../../src/lib/server/queue/handlers/stock-threshold-check';
import { JOB_PAYLOAD_SCHEMAS, jobKey } from '../../src/lib/server/queue/topics';
import { Worker } from '../../src/lib/server/queue/worker';
import { StockThreshold } from '../../src/lib/server/stock/stock-threshold';
import { fanoutJobs, resetInventories, stockItemId, thresholdJobs } from './helpers/crm-stock';
import { insertUser, migratedDatabase } from './helpers/db';
import {
	crmActor,
	optionId,
	resetRequests,
	seedOrderingWorld,
	variantId
} from './helpers/portal-requests';

const db = migratedDatabase();
seedOrderingWorld(db);
const managerId = insertUser({ email: 'mgr@thr.example', role: 'manager', counterpartyId: null });
const manager = crmActor('manager', managerId);

const PINE = stockItemId(db, 'CMP-BOARD-PINE'); // threshold 40
const VOLGA = stockItemId(db, 'MDL-201-180-PIN'); // threshold 0: the watch is off
const WALNUT = optionId(db, 'Орех');
const ctx = { jobId: 1, attempt: 1, now: new Date(), logger: pino({ level: 'silent' }) };

function purchase(itemId: number, qty: number, colour: number | null = null) {
	new StockMoveService(manager).create(itemId, {
		type: 'purchase',
		optionId: colour,
		qty,
		reasonId: null,
		comment: null
	});
}

// The real clock by default: `visible_at` is stored in whole seconds at enqueue time, so a clock
// frozen at module load misses every job queued in a later second.
function worker(threshold = new StockThreshold(), clock: () => Date = () => new Date()): Worker {
	return new Worker({ handlers: [createStockThresholdCheckHandler({ threshold })], clock });
}

beforeEach(() => {
	resetInventories(db);
	resetRequests(db);
});

describe('the job contract of stock.threshold.check (tech.md 7.2)', () => {
	it('queues the documented payload under the documented key', () => {
		purchase(PINE, 10);

		const [job] = thresholdJobs(db);
		expect(job?.payload).toEqual({ stockItemId: PINE });
		expect(JOB_PAYLOAD_SCHEMAS['stock.threshold.check'].safeParse(job?.payload).success).toBe(true);
		expect(job?.idempotencyKey).toMatch(new RegExp(`^threshold:${PINE}:\\d{8}$`));
		expect(jobKey.threshold(4, new Date('2026-10-02T23:59:00Z'))).toBe('threshold:4:20261002');
	});

	it('refuses a payload outside the schema', async () => {
		const handler = createStockThresholdCheckHandler({ threshold: new StockThreshold() });
		await expect(handler.run({ stockItemId: 'four' }, ctx)).rejects.toBeInstanceOf(
			InvalidPayloadError
		);
	});
});

describe('which moves raise the signal (tech.md v1.45)', () => {
	it('queues one check a day for an item that stays under its threshold', () => {
		purchase(PINE, 10);
		purchase(PINE, 5);
		expect(thresholdJobs(db)).toHaveLength(1);
	});

	it('stays silent above the threshold and for an item with a zero threshold', () => {
		purchase(PINE, 40);
		purchase(VOLGA, 1, WALNUT);
		expect(thresholdJobs(db)).toEqual([]);
	});

	it('watches a production mark of the shop floor and an applied inventory', () => {
		db.run(`update stock_items set min_threshold = 5 where id = ${VOLGA}`);
		new ShopService(manager).produce({
			variantId: variantId(db, 'MDL-201-180-PIN'),
			optionId: WALNUT,
			qty: 2
		});
		expect(thresholdJobs(db).map((job) => job.payload)).toEqual([{ stockItemId: VOLGA }]);
		db.run(`update stock_items set min_threshold = 0 where id = ${VOLGA}`);

		purchase(PINE, 50);
		const inventory = new InventoryService(manager);
		const id = inventory.create({ kind: 'component', comment: null });
		const line = inventory.card(id).lines.find((row) => row.stockItemId === PINE);
		inventory.apply(id, { comment: null, lines: [{ lineId: line?.id ?? 0, actualQty: 12 }] });
		expect(thresholdJobs(db).map((job) => job.payload)).toContainEqual({ stockItemId: PINE });
	});
});

describe('the handler', () => {
	it('publishes stock.below_threshold for an item under its threshold', async () => {
		purchase(PINE, 10);

		await worker().drain();

		expect(thresholdJobs(db).map((job) => job.status)).toEqual(['done']);
		expect(fanoutJobs(db).map((job) => job.payload)).toEqual([
			{ eventKey: 'stock.below_threshold', entityId: PINE }
		]);
	});

	it('gives one event when the same check runs twice', async () => {
		purchase(PINE, 10);
		const handler = createStockThresholdCheckHandler({ threshold: new StockThreshold() });

		await handler.run({ stockItemId: PINE }, ctx);
		await handler.run({ stockItemId: PINE }, ctx);

		expect(fanoutJobs(db)).toHaveLength(1);
	});

	it('publishes nothing when the shelf was refilled before the job ran', async () => {
		purchase(PINE, 10);
		purchase(PINE, 60);

		await worker().drain();

		expect(thresholdJobs(db).map((job) => job.status)).toEqual(['done']);
		expect(fanoutJobs(db)).toEqual([]);
	});

	it('retries a failing check with backoff, then gives up as dead with no event', async () => {
		purchase(PINE, 10);
		const broken = new StockThreshold();
		broken.isBelow = () => {
			throw new Error('disk I/O error');
		};
		let offsetMs = 0;
		const run = worker(broken, () => new Date(Date.now() + offsetMs));

		await run.drain();
		expect(thresholdJobs(db)[0]).toMatchObject({ status: 'pending', attempts: 1 });

		for (let attempt = 1; attempt < 5; attempt += 1) {
			offsetMs += backoffSeconds(attempt) * 1000;
			await run.drain();
		}

		expect(thresholdJobs(db).map((job) => job.status)).toEqual(['dead']);
		expect(fanoutJobs(db)).toEqual([]);
	});
});
