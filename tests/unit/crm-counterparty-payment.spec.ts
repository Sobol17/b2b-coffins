import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { DebtRepository } from '../../src/lib/server/counterparty/debt.repository';
import { CrmRequestCardService } from '../../src/lib/server/crm-request/crm-request-card.service';
import { auditLog, paymentMarks, requests } from '../../src/lib/server/db/schema';
import { CounterpartyPaymentService } from '../../src/lib/server/payment/counterparty-payment.service';
import { PaymentMarkService } from '../../src/lib/server/payment/payment-mark.service';
import { RequestTransitionService } from '../../src/lib/server/request/request-transition.service';
import { paymentMarkSchema } from '../../src/lib/validation/payment';
import { migratedDatabase } from './helpers/db';
import { seedDeliveryWorld } from './helpers/crm-delivery';
import { resetRequests } from './helpers/portal-requests';
import { fanouts, refused, statusOf } from './helpers/transitions';

const db = migratedDatabase();
const { world, actors, assembled, delivery, lineOf } = seedDeliveryWorld(db);
const TODAY = new Date().toISOString().slice(0, 10);
const TEN_K = 10_000_00;

/** A request handed over without cash, with its total set to the given amount. */
function delivered(totalMinor = TEN_K): number {
	const id = assembled(1);
	const line = lineOf(id);
	delivery().load({ itemId: line.itemId, qty: line.qty });
	db.update(requests).set({ totalMinor }).where(eq(requests.id, id)).run();
	new RequestTransitionService(actors.driver).deliver(id, false);
	return id;
}

function input(amountMinor: number, patch: Record<string, string> = {}) {
	return paymentMarkSchema.parse({
		amountMinor: String(amountMinor),
		paidAt: TODAY,
		method: 'bank',
		comment: '',
		...patch
	});
}

const pay = (amountMinor: number, ctx = actors.manager, counterpartyId = world.cpId) =>
	new CounterpartyPaymentService(ctx).pay(counterpartyId, input(amountMinor));
const markOne = (id: number, amountMinor: number) =>
	new PaymentMarkService(actors.manager).mark(id, input(amountMinor));
const sumOf = (id: number) =>
	db
		.select({ amount: paymentMarks.amountMinor })
		.from(paymentMarks)
		.where(eq(paymentMarks.requestId, id))
		.all()
		.reduce((sum, row) => sum + row.amount, 0);
const debt = () => new DebtRepository().of(world.cpId).debtMinor;

beforeEach(() => resetRequests(db));

describe('a payment against the whole debt of a counterparty (v1.65)', () => {
	it('spreads 15 000 of 30 000 oldest first and closes none of the three requests', () => {
		const [a, b, c] = [delivered(), delivered(), delivered()];

		const result = pay(15_000_00);

		expect(result).toEqual({ amountMinor: 15_000_00, requestCount: 2, closedCount: 0 });
		expect([sumOf(a), sumOf(b), sumOf(c)]).toEqual([TEN_K, 5_000_00, 0]);
		expect([statusOf(a), statusOf(b), statusOf(c)]).toEqual([
			'awaiting_payment',
			'awaiting_payment',
			'awaiting_payment'
		]);
		expect(debt()).toBe(15_000_00);
	});

	it('moves all three to paid together once the rest of the debt arrives', () => {
		const [a, b, c] = [delivered(), delivered(), delivered()];
		pay(15_000_00);

		const result = pay(15_000_00);

		expect(result).toEqual({ amountMinor: 15_000_00, requestCount: 2, closedCount: 3 });
		expect([statusOf(a), statusOf(b), statusOf(c)]).toEqual(['paid', 'paid', 'paid']);
		expect(debt()).toBe(0);
		expect(fanouts('request.paid')).toHaveLength(3);
	});

	it('holds a request covered on its card while the counterparty owes on another one', () => {
		const a = delivered();
		const b = delivered();

		expect(markOne(a, TEN_K).status).toBe('awaiting_payment');
		expect(new CrmRequestCardService(actors.manager).card(a)).toMatchObject({
			dueMinor: 0,
			canMarkPayment: false
		});

		expect(markOne(b, TEN_K).status).toBe('paid');
		expect(statusOf(a)).toBe('paid');
	});

	it('refuses more than the debt and a counterparty that owes nothing, writing no mark', () => {
		const a = delivered();

		expect(refused(() => pay(TEN_K + 100_00)).status).toBe(422);
		expect(() => pay(TEN_K + 100_00)).toThrow('Сумма больше долга контрагента');
		expect(sumOf(a)).toBe(0);
		pay(TEN_K);
		expect(() => pay(100_00)).toThrow('У контрагента нет долга к оплате');
	});

	it('never takes the money of another counterparty', () => {
		delivered();
		expect(() => pay(TEN_K, actors.manager, world.otherCpId)).toThrow(
			'У контрагента нет долга к оплате'
		);
		expect(refused(() => pay(TEN_K, actors.manager, 999_999)).status).toBe(404);
	});

	it('lets only a role that marks payments take the money', () => {
		delivered();
		for (const ctx of [actors.driver, actors.carpenter, actors.admin]) {
			expect(refused(() => pay(TEN_K, ctx)).status).toBe(403);
		}
	});

	it('journals the payment with the split and the closed requests', () => {
		const a = delivered();
		const b = delivered(5_000_00);

		pay(15_000_00);

		expect(
			db.select().from(auditLog).where(eq(auditLog.action, 'payment.counterparty')).all()
		).toEqual([
			expect.objectContaining({
				entity: 'counterparties',
				entityId: world.cpId,
				after: expect.objectContaining({
					amountMinor: 15_000_00,
					allocations: [
						{ requestId: a, amountMinor: TEN_K },
						{ requestId: b, amountMinor: 5_000_00 }
					],
					closed: [a, b]
				})
			})
		]);
	});

	it('closes a cash delivery at once when nothing else is owed, and holds it otherwise', () => {
		const held = delivered();
		const id = assembled(1);
		const line = lineOf(id);
		delivery().load({ itemId: line.itemId, qty: line.qty });

		expect(new RequestTransitionService(actors.driver).deliver(id, true).status).toBe(
			'awaiting_payment'
		);
		pay(debt());
		expect([statusOf(held), statusOf(id)]).toEqual(['paid', 'paid']);
	});
});
