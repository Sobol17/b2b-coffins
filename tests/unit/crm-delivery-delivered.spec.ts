import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { requests } from '../../src/lib/server/db/schema';
import { RequestTransitionService } from '../../src/lib/server/request/request-transition.service';
import { DELIVERED_DAYS } from '../../src/lib/types/crm-delivery';
import { migratedDatabase } from './helpers/db';
import { seedDeliveryWorld } from './helpers/crm-delivery';
import { resetRequests } from './helpers/portal-requests';

const db = migratedDatabase();
const { actors, assembled, delivery, lineOf, toStock } = seedDeliveryWorld(db);
const DAY_MS = 86_400_000;

/** Loaded whole and taken to the door; cash closes the request in `paid` (tech.md 6.2). */
function delivered(cash: boolean): number {
	const id = assembled(1);
	const line = lineOf(id);
	delivery().load({ itemId: line.itemId, qty: line.qty });
	new RequestTransitionService(actors.driver).deliver(id, cash);
	return id;
}

function deliveredDaysAgo(id: number, days: number): void {
	db.update(requests)
		.set({ deliveredAt: new Date(Date.now() - days * DAY_MS) })
		.where(eq(requests.id, id))
		.run();
}

function keysOf(value: unknown): string[] {
	if (Array.isArray(value)) return value.flatMap(keysOf);
	if (value === null || typeof value !== 'object') return [];
	return Object.entries(value).flatMap(([key, inner]) => [key, ...keysOf(inner)]);
}

beforeEach(() => resetRequests(db));

describe('the delivered block of the delivery screen', () => {
	it('lists a request right after the door, whatever the payment did', () => {
		// Cash first: a request closes only while the counterparty owes nothing else (v1.65).
		const byCash = delivered(true);
		const byInvoice = delivered(false);

		const rows = delivery().overview().delivered;

		expect(rows.map((row) => row.id)).toEqual([byInvoice, byCash]);
		expect(rows.find((row) => row.id === byCash)).toMatchObject({
			counterpartyName: 'Ритуал-Сервис',
			deceasedName: 'Иванов Иван Иванович',
			address: 'Москва, Полевая, 12',
			unitCount: 1,
			status: 'paid'
		});
		expect(rows.find((row) => row.id === byInvoice)?.status).toBe('awaiting_payment');
	});

	it('puts the newest delivery first', () => {
		const older = delivered(false);
		const newer = delivered(false);
		deliveredDaysAgo(older, 2);
		deliveredDaysAgo(newer, 1);

		expect(
			delivery()
				.overview()
				.delivered.map((row) => row.id)
		).toEqual([newer, older]);
	});

	it(`keeps only the last ${DELIVERED_DAYS} days`, () => {
		const fresh = delivered(false);
		const stale = delivered(false);
		deliveredDaysAgo(stale, DELIVERED_DAYS + 1);

		const screen = delivery().overview();

		expect(screen.delivered.map((row) => row.id)).toEqual([fresh]);
		expect(screen.deliveredTotal).toBe(1);
	});

	it('leaves requests still on the shelf and stock requests out', () => {
		assembled(1);
		const id = delivered(false);
		toStock(id);

		expect(delivery().overview().delivered).toEqual([]);
	});

	it('carries no money: the driver already collected or left the invoice', () => {
		delivered(true);
		delivered(false);

		expect(keysOf(delivery().overview().delivered).filter((key) => key.includes('Minor'))).toEqual(
			[]
		);
	});

	it('shows the same block to the manager and the owner', () => {
		const id = delivered(false);

		for (const ctx of [actors.manager, actors.owner]) {
			expect(
				delivery(ctx)
					.overview()
					.delivered.map((row) => row.id)
			).toEqual([id]);
		}
	});
});
