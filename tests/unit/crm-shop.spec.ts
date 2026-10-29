import { and, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import {
	ConflictError,
	ForbiddenError,
	NotFoundError,
	ValidationError
} from '../../src/lib/server/core/errors';
import { ShopService } from '../../src/lib/server/crm-shop/shop.service';
import { ShopTaskService } from '../../src/lib/server/crm-shop/shop-task.service';
import { auditLog, stockMoves } from '../../src/lib/server/db/schema';
import type { ActorContext } from '../../src/lib/types/actor';
import type { WorkRole } from '../../src/lib/types/roles';
import { shopProgressSchema } from '../../src/lib/validation/crm-shop';
import { seedShopWorld } from './helpers/crm-shop';
import { thresholdJobs } from './helpers/crm-stock';
import { insertUser, migratedDatabase } from './helpers/db';
import { crmActor, resetRequests } from './helpers/portal-requests';
import { statusOf } from './helpers/transitions';

const db = migratedDatabase();
const { actors, stockItemId, inWork, forStock, jobsOf, visitsOf } = seedShopWorld(db, 'c19s');
const STATION_ACTOR: Readonly<Record<WorkRole, ActorContext>> = {
	carpenter: actors.carpenter,
	grinder: actors.grinder,
	painter: actors.painter,
	upholsterer: actors.upholsterer
};

const reads = (ctx: ActorContext = actors.carpenter) => new ShopService(ctx);
const acts = (ctx: ActorContext = actors.carpenter) => new ShopTaskService(ctx);

function openVisit(requestId: number, station: WorkRole) {
	const visit = visitsOf(requestId, station).find((row) => row.completedAt === null);
	if (!visit) throw new Error(`no open ${station} visit for request ${requestId}`);
	return visit.id;
}

/** Marks every job of the visit done and presses «Выполнено», as the station would. */
function finish(requestId: number, station: WorkRole): void {
	const ctx = STATION_ACTOR[station];
	const taskId = openVisit(requestId, station);
	acts(ctx).take(taskId);
	for (const job of reads(ctx).task(taskId).jobs)
		acts(ctx).progress({ jobId: job.id, doneQty: job.qty });
	acts(ctx).complete(taskId);
}

const productions = () =>
	db.select().from(stockMoves).where(eq(stockMoves.type, 'production')).all();
const audits = (action: string) =>
	db.select().from(auditLog).where(eq(auditLog.action, action)).all();

beforeEach(() => resetRequests(db));

describe('rights on the stations (tech.md §19)', () => {
	it('opens the screen to the crew and the heads and closes it to the driver and the portal', () => {
		expect(
			reads(actors.carpenter)
				.overview({})
				.stations.map((row) => row.station)
		).toEqual(['carpenter']);
		expect(reads(actors.manager).overview({}).stations).toHaveLength(4);
		expect(() => reads(actors.driver)).toThrow(ForbiddenError);
		expect(() => reads(actors.admin)).toThrow(ForbiddenError);
		expect(() => acts(actors.driver)).toThrow(ForbiddenError);
	});

	it('shows a person with two shop roles both stations and refuses a third one', () => {
		const both = crmActor(
			'grinder',
			insertUser({ email: 'two@c19s.example', role: 'grinder', counterpartyId: null })
		);
		const twoRoles = { ...both, roles: ['grinder', 'painter'] as const };
		const id = inWork(1);

		expect(
			reads(twoRoles)
				.overview({})
				.stations.map((row) => row.station)
		).toEqual(['grinder', 'painter']);
		expect(() => reads(twoRoles).task(openVisit(id, 'carpenter'))).toThrow(ForbiddenError);
		expect(() => reads(twoRoles).overview({ station: 'carpenter' })).toThrow(ForbiddenError);
	});

	it('answers 403 to the grinder on a carpenter visit and 404 on an unknown one', () => {
		const taskId = openVisit(inWork(1), 'carpenter');

		expect(() => reads(actors.grinder).task(taskId)).toThrow(ForbiddenError);
		expect(() => acts(actors.grinder).take(taskId)).toThrow(ForbiddenError);
		expect(() => reads().task(999_999)).toThrow(NotFoundError);
	});

	it('sends no money, no counterparty, no address and no deceased name to the crew', () => {
		const taskId = openVisit(inWork(2), 'carpenter');
		const body = JSON.stringify([reads().overview({}), reads().task(taskId)]);

		for (const key of ['Minor', 'counterparty', 'deceasedName', 'address', 'Иванов']) {
			expect(body).not.toContain(key);
		}
	});
});

describe('a visit at a station (tech.md §20.4)', () => {
	it('moves from «Новые» to «В работе» when taken, and a second take writes nothing', () => {
		const taskId = openVisit(inWork(2), 'carpenter');
		expect(
			reads()
				.overview({})
				.stations[0]?.fresh.map((row) => row.id)
		).toEqual([taskId]);

		acts().take(taskId);
		acts(actors.manager).take(taskId);

		const [station] = reads().overview({}).stations;
		expect([station?.fresh, station?.taken.map((row) => row.id)]).toEqual([[], [taskId]]);
		expect(reads().task(taskId)).toMatchObject({ canTake: false, takenByName: expect.any(String) });
		expect(audits('shop.task.take')).toHaveLength(1);
	});

	it('lists an urgent visit before a normal one and finds a visit by its number', () => {
		const normal = inWork(1, { inDays: 1 });
		const urgent = inWork(1, { urgent: true, inDays: 9 });
		const fresh = reads().overview({}).stations[0]?.fresh ?? [];
		expect(fresh.map((row) => row.requestId)).toEqual([urgent, normal]);

		const number = fresh[1]?.number ?? '';
		const found = reads().overview({ search: number }).stations[0];
		expect([found?.total, found?.fresh.map((row) => row.requestId)]).toEqual([1, [normal]]);
	});

	it('takes a counter from 0 to qty and refuses one above qty', () => {
		const id = inWork(3);
		const [job] = reads().task(openVisit(id, 'carpenter')).jobs;

		acts().progress({ jobId: job?.id ?? 0, doneQty: 2 });

		expect(jobsOf(id).map((row) => [row.qty, row.doneQty])).toEqual([[3, 2]]);
		expect(() => acts().progress({ jobId: job?.id ?? 0, doneQty: 4 })).toThrow(ValidationError);
		expect(shopProgressSchema.safeParse({ jobId: '1', doneQty: '-1' }).success).toBe(false);
		expect(audits('shop.job.progress')[0]?.before).toEqual({ doneQty: 0 });
	});

	it('keeps «Выполнено» shut until every job is done', () => {
		const id = inWork(2);
		const taskId = openVisit(id, 'carpenter');
		expect(reads().task(taskId).canComplete).toBe(false);

		expect(() => acts().complete(taskId)).toThrow(ConflictError);
		expect(visitsOf(id, 'carpenter')[0]?.completedAt).toBeNull();
	});

	it('hands the done pieces to the grinder with a fresh counter', () => {
		const id = inWork(2);
		finish(id, 'carpenter');

		expect(visitsOf(id, 'carpenter')[0]?.completedAt).not.toBeNull();
		expect(jobsOf(id).map((row) => [row.station, row.qty, row.doneQty])).toEqual([
			['grinder', 2, 0]
		]);
		expect(reads(actors.grinder).task(openVisit(id, 'grinder')).jobs).toHaveLength(1);
	});

	it('answers 409 to a second «Выполнено» and writes one production', () => {
		const id = inWork(1);
		for (const station of ['carpenter', 'grinder', 'painter'] as const) finish(id, station);
		const taskId = openVisit(id, 'upholsterer');
		finish(id, 'upholsterer');

		expect(() => acts(actors.upholsterer).complete(taskId)).toThrow(
			'Визит уже закрыт, обновите страницу'
		);
		expect(productions()).toHaveLength(1);
	});
});

describe('the end of the line (tech.md §20.4)', () => {
	it('puts the pieces on the shelf after the upholsterer and readies the request', () => {
		const id = inWork(2);
		for (const station of ['carpenter', 'grinder', 'painter', 'upholsterer'] as const)
			finish(id, station);

		const [made] = productions();
		expect(made).toMatchObject({ qty: 2, requestId: null, requestItemId: null });
		expect(statusOf(id)).toBe('ready');
		expect(jobsOf(id)).toEqual([]);
		expect(audits('shop.task.complete').at(-1)?.after).toMatchObject({
			next: null,
			moveIds: [made?.id]
		});
	});

	it('watches the threshold of the item the upholsterer puts on the shelf', () => {
		db.run(`update stock_items set min_threshold = 5 where id = ${stockItemId}`);
		try {
			const id = inWork(1);
			for (const station of ['carpenter', 'grinder', 'painter', 'upholsterer'] as const)
				finish(id, station);

			expect(thresholdJobs(db).map((job) => job.payload)).toContainEqual({ stockItemId });
		} finally {
			db.run(`update stock_items set min_threshold = 0 where id = ${stockItemId}`);
		}
	});

	it('readies a stock request only after the upholsterer, however full the shelf', () => {
		const id = forStock(1);
		for (const station of ['carpenter', 'grinder', 'painter'] as const) finish(id, station);
		expect(statusOf(id)).toBe('in_work');

		finish(id, 'upholsterer');

		expect(statusOf(id)).toBe('ready');
	});

	it('lets the administrator act for any station', () => {
		const id = inWork(1);
		const manager = actors.manager;
		for (const station of ['carpenter', 'grinder', 'painter', 'upholsterer'] as const) {
			const taskId = openVisit(id, station);
			for (const job of reads(manager).task(taskId).jobs)
				acts(manager).progress({ jobId: job.id, doneQty: job.qty });
			acts(manager).complete(taskId);
		}

		expect(statusOf(id)).toBe('ready');
		expect(
			db
				.select()
				.from(auditLog)
				.where(and(eq(auditLog.action, 'shop.task.complete'), eq(auditLog.actorId, manager.userId)))
				.all()
		).toHaveLength(4);
	});
});
