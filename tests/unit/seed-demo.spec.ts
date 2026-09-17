import { and, eq, like, sql } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { seedCatalog, seedStockBalances, seedStockItems } from '../../scripts/seed/catalog';
import { seedDemo } from '../../scripts/seed/demo';
import {
	seedCounterparties,
	seedCrmUsers,
	seedPriceLists,
	seedStaff
} from '../../scripts/seed/parties';
import {
	seedDicts,
	seedNotificationRules,
	seedNotificationTemplates,
	seedNumbering,
	seedRoles,
	seedSettings
} from '../../scripts/seed/reference';
import {
	auditLog,
	counterparties,
	jobQueue,
	notifications,
	requestStatusHistory,
	requests,
	users
} from '../../src/lib/server/db/schema';
import { migratedDatabase } from './helpers/db';

const db = migratedDatabase();
const RITUAL = 'Ритуал-Сервис';
const ADMIN = 'admin@ritual-service.example';
const EMPLOYEE = 'employee@ritual-service.example';

function userId(email: string): number {
	return db.select({ id: users.id }).from(users).where(eq(users.email, email)).all()[0]?.id ?? 0;
}

function demoRequests() {
	return db
		.select({
			id: requests.id,
			number: requests.number,
			status: requests.status,
			counterparty: counterparties.name,
			createdById: requests.createdById
		})
		.from(requests)
		.innerJoin(counterparties, eq(counterparties.id, requests.counterpartyId))
		.where(like(requests.externalNumber, 'ДЕМО-%'))
		.orderBy(requests.id)
		.all();
}

function mailLog(email: string) {
	return db
		.select({
			status: notifications.status,
			requestId: sql<number>`json_extract(${notifications.payload}, '$.entityId')`
		})
		.from(notifications)
		.where(and(eq(notifications.userId, userId(email)), eq(notifications.channel, 'email')))
		.all();
}

function counts() {
	return {
		requests: db.select().from(requests).all().length,
		history: db.select().from(requestStatusHistory).all().length,
		notifications: db.select().from(notifications).all().length,
		jobs: db.select().from(jobQueue).all().length,
		audit: db.select().from(auditLog).all().length
	};
}

let firstRun: Awaited<ReturnType<typeof seedDemo>>;

beforeAll(async () => {
	seedRoles(db);
	seedDicts(db);
	seedSettings(db);
	seedNumbering(db);
	seedNotificationRules(db);
	seedNotificationTemplates(db);
	seedStockItems(db);
	seedCatalog(db);
	seedStockBalances(db);
	await seedCrmUsers(db);
	seedStaff(db);
	await seedCounterparties(db, seedPriceLists(db));
	firstRun = await seedDemo(db);
}, 60_000);

describe('pnpm seed:demo (v1.23)', () => {
	it('walks the requests of one counterparty through every status of the flow', () => {
		const rows = demoRequests();

		expect(new Set(rows.map((row) => row.counterparty))).toEqual(new Set([RITUAL]));
		expect(new Set(rows.map((row) => row.status))).toEqual(
			new Set(['new', 'in_work', 'ready', 'awaiting_payment', 'paid', 'cancelled', 'rejected'])
		);
		for (const row of rows) expect(row.number).toMatch(/^З-\d{4}-\d{5}$/);
	});

	it('writes both portal accounts as authors', () => {
		const authors = new Set(demoRequests().map((row) => row.createdById));

		expect(authors).toEqual(new Set([userId(ADMIN), userId(EMPLOYEE)]));
	});

	it('leaves a history that ends at the status of each request', () => {
		for (const row of demoRequests()) {
			const steps = db
				.select({ to: requestStatusHistory.toStatus })
				.from(requestStatusHistory)
				.where(eq(requestStatusHistory.requestId, row.id))
				.orderBy(requestStatusHistory.id)
				.all();
			expect(steps[0]?.to).toBe('new');
			expect(steps.at(-1)?.to).toBe(row.status);
		}
	});

	it('fills the mail log of the administrator and the employee through the queue', () => {
		const admin = mailLog(ADMIN);
		const employee = mailLog(EMPLOYEE);

		expect(admin.length).toBeGreaterThan(0);
		expect(employee.length).toBeGreaterThan(0);
		for (const row of [...admin, ...employee]) expect(row.status).toBe('sent');
		expect(firstRun.mailed).toBe(
			db.select().from(notifications).where(eq(notifications.status, 'sent')).all().length
		);
	});

	it('mails the employee only about requests the employee wrote', () => {
		const own = new Set(
			demoRequests()
				.filter((row) => row.createdById === userId(EMPLOYEE))
				.map((row) => row.id)
		);

		for (const row of mailLog(EMPLOYEE)) expect(own).toContain(row.requestId);
	});

	it('leaves no job behind', () => {
		const open = db
			.select({ topic: jobQueue.topic, status: jobQueue.status })
			.from(jobQueue)
			.all()
			.filter((job) => job.topic !== 'session.cleanup' && job.status !== 'done');

		expect(open).toEqual([]);
	});

	it('changes nothing on a second run', async () => {
		const before = counts();

		const again = await seedDemo(db);

		expect(again).toEqual({ requests: 0, mailed: 0 });
		expect(counts()).toEqual(before);
	});
});
