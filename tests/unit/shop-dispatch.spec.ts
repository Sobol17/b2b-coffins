import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { withTransaction } from '../../src/lib/server/core/tx';
import { CrmRequestItemsService } from '../../src/lib/server/crm-request/crm-request-items.service';
import { CrmRequestPriorityService } from '../../src/lib/server/crm-request/crm-request-priority.service';
import { ShopDispatch } from '../../src/lib/server/crm-shop/shop-dispatch';
import { jobQueue, requestItems, shopTasks } from '../../src/lib/server/db/schema';
import { seedShopWorld } from './helpers/crm-shop';
import { migratedDatabase } from './helpers/db';
import { optionId, resetRequests } from './helpers/portal-requests';
import { statusOf } from './helpers/transitions';

const db = migratedDatabase();
const { actors, volga, inWork, forStock, purchase, jobsOf, visitsOf } = seedShopWorld(db, 'c19d');
const white = optionId(db, 'Белый');

const arrivals = () =>
	db
		.select()
		.from(jobQueue)
		.where(eq(jobQueue.topic, 'notification.fanout'))
		.all()
		.filter((job) => JSON.stringify(job.payload).includes('shop.task_arrived'));

const pieces = (requestId: number) =>
	jobsOf(requestId).map((job) => [job.station, job.qty, job.doneQty]);

const dispatch = () => withTransaction((tx) => new ShopDispatch().run(tx));

beforeEach(() => resetRequests(db));

describe('dispatch on acceptance (tech.md §20.4)', () => {
	it('sends every piece to the carpenter when the shelf is empty, with one event', () => {
		const id = inWork(2);

		expect(pieces(id)).toEqual([['carpenter', 2, 0]]);
		expect(visitsOf(id).map((visit) => [visit.station, visit.completedAt])).toEqual([
			['carpenter', null]
		]);
		expect(arrivals()).toHaveLength(1);
	});

	it('changes nothing when it runs again on the same data', () => {
		inWork(2);

		expect(dispatch()).toEqual({ added: 0, shrunk: 0, openedTaskIds: [] });
		expect(arrivals()).toHaveLength(1);
	});

	it('sends only what the shelf does not cover', () => {
		purchase(1);
		const id = inWork(3);

		expect(pieces(id)).toEqual([['carpenter', 2, 0]]);
	});

	it('adds to the open visit instead of opening a second one', () => {
		const id = inWork(1);
		new CrmRequestItemsService(actors.manager).addLine(id, {
			variantId: volga,
			optionId: white,
			qty: 2,
			comment: 'Ещё два'
		});

		expect(visitsOf(id, 'carpenter')).toHaveLength(1);
		expect(pieces(id)).toEqual([
			['carpenter', 1, 0],
			['carpenter', 2, 0]
		]);
		expect(arrivals()).toHaveLength(1);
	});
});

describe('urgent requests take the shelf first (tech.md §20.4)', () => {
	it('never takes the piece of a ready request for an urgent one', () => {
		purchase(1);
		const normal = inWork(1, { inDays: 2 });
		expect(statusOf(normal)).toBe('ready');

		const urgent = inWork(1, { urgent: true });

		expect(statusOf(urgent)).toBe('in_work');
		expect(pieces(urgent)).toEqual([['carpenter', 1, 0]]);
		expect(pieces(normal)).toEqual([]);
	});

	it('takes the piece from a normal request still in work once it turns urgent', () => {
		purchase(1);
		const first = inWork(2, { inDays: 2 });
		const second = inWork(1, { inDays: 5 });
		expect([pieces(first), pieces(second)]).toEqual([[['carpenter', 1, 0]], [['carpenter', 1, 0]]]);

		new CrmRequestPriorityService(actors.manager).setPriority(second, 'urgent');

		expect(statusOf(second)).toBe('ready');
		expect(pieces(first)).toEqual([['carpenter', 2, 0]]);
		expect(pieces(second)).toEqual([]);
	});
});

describe('stock arriving outside the stations (tech.md §20.4)', () => {
	it('readies a covered request and closes its emptied visit without a person', () => {
		const id = inWork(2);
		const [visit] = visitsOf(id);

		purchase(2);

		expect(statusOf(id)).toBe('ready');
		expect(pieces(id)).toEqual([]);
		const [closed] = db
			.select()
			.from(shopTasks)
			.where(eq(shopTasks.id, visit?.id ?? 0))
			.all();
		expect(closed?.completedAt).not.toBeNull();
		expect(closed?.completedById).toBeNull();
	});

	it('gives back only the undone carpenter pieces of a partly covered line', () => {
		const id = inWork(3);
		purchase(1);

		expect(statusOf(id)).toBe('in_work');
		expect(pieces(id)).toEqual([['carpenter', 2, 0]]);
	});
});

describe('requests for the own shelf (tech.md §20.4)', () => {
	it('sends every piece to the shop even when the shelf is full and stays in work', () => {
		purchase(5);
		const id = forStock(2);

		expect(statusOf(id)).toBe('in_work');
		expect(pieces(id)).toEqual([['carpenter', 2, 0]]);
	});
});

describe('edits of the request (tech.md §20.4)', () => {
	it('drops the jobs of a removed line together with it', () => {
		const id = inWork(1);
		new CrmRequestItemsService(actors.manager).addLine(id, {
			variantId: volga,
			optionId: white,
			qty: 2,
			comment: 'Ещё два'
		});
		const [, second] = db.select().from(requestItems).where(eq(requestItems.requestId, id)).all();

		new CrmRequestItemsService(actors.manager).removeLine(id, {
			itemId: second?.id ?? 0,
			comment: 'Лишнее'
		});

		expect(pieces(id)).toEqual([['carpenter', 1, 0]]);
	});
});
