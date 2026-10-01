import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { DebtRepository } from '../../src/lib/server/counterparty/debt.repository';
import { CrmRequestCardService } from '../../src/lib/server/crm-request/crm-request-card.service';
import { auditLog, paymentMarks, requests } from '../../src/lib/server/db/schema';
import { PaymentMarkService } from '../../src/lib/server/payment/payment-mark.service';
import { RequestTransitionService } from '../../src/lib/server/request/request-transition.service';
import { paymentMarkSchema, paymentReverseSchema } from '../../src/lib/validation/payment';
import { migratedDatabase } from './helpers/db';
import { seedDeliveryWorld } from './helpers/crm-delivery';
import { resetRequests } from './helpers/portal-requests';
import { fanouts, history, refused, statusOf, totalOf } from './helpers/transitions';

const db = migratedDatabase();
const { world, ids, actors, inWork, assembled, delivery, lineOf, toStock } = seedDeliveryWorld(db);
const TODAY = new Date().toISOString().slice(0, 10);

/** A counterparty request handed over without cash: it waits for the money. */
function delivered(qty = 2): number {
	const id = assembled(qty);
	const line = lineOf(id);
	delivery().load({ itemId: line.itemId, qty: line.qty });
	new RequestTransitionService(actors.driver).deliver(id, false);
	return id;
}

function mark(
	id: number,
	amountMinor: number,
	patch: Record<string, string> = {},
	ctx = actors.manager
) {
	const input = paymentMarkSchema.parse({
		amountMinor: String(amountMinor),
		paidAt: TODAY,
		method: 'bank',
		comment: '',
		...patch
	});
	return new PaymentMarkService(ctx).mark(id, input);
}

function reverse(id: number, markId: number, comment = 'Ошибка в сумме') {
	const input = paymentReverseSchema.parse({ markId: String(markId), comment });
	return new PaymentMarkService(actors.manager).reverse(id, input);
}

function marksOf(id: number) {
	return db
		.select()
		.from(paymentMarks)
		.where(eq(paymentMarks.requestId, id))
		.orderBy(paymentMarks.id)
		.all();
}

const sumOf = (id: number) => marksOf(id).reduce((sum, row) => sum + row.amountMinor, 0);
const paidColumn = (id: number) =>
	db.select({ paid: requests.paidMinor }).from(requests).where(eq(requests.id, id)).all()[0]?.paid;
const card = (id: number, ctx = actors.manager) => new CrmRequestCardService(ctx).card(id);
const audit = (action: string) =>
	db.select().from(auditLog).where(eq(auditLog.action, action)).all();

beforeEach(() => resetRequests(db));

describe('payment marks of a request (C7, tech.md v1.44)', () => {
	it('keeps a partly paid request in awaiting_payment with the rest to pay', () => {
		const id = delivered();

		const result = mark(id, 1000_00, { method: 'card', comment: ' Первый платёж ' });

		expect(result.status).toBe('awaiting_payment');
		expect(marksOf(id)).toEqual([
			expect.objectContaining({
				amountMinor: 1000_00,
				method: 'card',
				comment: 'Первый платёж',
				createdById: ids.manager,
				reversalOfId: null
			})
		]);
		expect(card(id)).toMatchObject({
			status: 'awaiting_payment',
			paidMinor: 1000_00,
			dueMinor: totalOf(id) - 1000_00,
			canMarkPayment: true
		});
	});

	it('closes the request by the system once the marks cover the total to the kopeck', () => {
		const id = delivered();
		mark(id, 1000_00);

		const result = mark(id, totalOf(id) - 1000_00);

		expect(result.status).toBe('paid');
		expect(sumOf(id)).toBe(totalOf(id));
		expect(paidColumn(id)).toBe(totalOf(id));
		expect(history(id).at(-1)).toMatchObject({
			fromStatus: 'awaiting_payment',
			toStatus: 'paid',
			actorId: null
		});
		expect(card(id)).toMatchObject({ status: 'paid', dueMinor: 0, canMarkPayment: false });
	});

	it('takes the rest typed in whole rubles as the rest with its kopecks', () => {
		const id = delivered();
		db.update(requests).set({ totalMinor: 12_345_40 }).where(eq(requests.id, id)).run();

		expect(mark(id, 12_345_00).status).toBe('paid');
		expect(sumOf(id)).toBe(12_345_40);
	});

	it('refuses an overpayment and writes nothing', () => {
		const id = delivered();

		expect(() => mark(id, totalOf(id) + 100_00)).toThrow('Сумма больше остатка к оплате');
		expect(refused(() => mark(id, totalOf(id) + 100_00)).status).toBe(422);
		expect(marksOf(id)).toEqual([]);
		expect(statusOf(id)).toBe('awaiting_payment');
	});

	it('refuses a payment dated tomorrow', () => {
		const id = delivered();
		const tomorrow = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);

		expect(refused(() => mark(id, 100_00, { paidAt: tomorrow }))).toEqual({
			name: 'ValidationError',
			status: 422
		});
		expect(marksOf(id)).toEqual([]);
	});

	it('takes no money before the delivery, after the closing or for a stock request', () => {
		const paid = delivered(1);
		mark(paid, totalOf(paid));
		expect(refused(() => mark(paid, 100_00)).status).toBe(409);

		const stock = delivered(1);
		toStock(stock);
		expect(refused(() => mark(stock, 100_00)).status).toBe(409);

		const ready = assembled(1);
		expect(refused(() => mark(ready, 100_00)).status).toBe(409);
		const work = inWork(1);
		expect(refused(() => mark(work, 100_00)).status).toBe(409);
		expect(marksOf(ready).length + marksOf(work).length + marksOf(stock).length).toBe(0);
		expect(marksOf(paid)).toHaveLength(1);
	});

	it('answers 404 for an unknown request', () => {
		expect(refused(() => mark(999_999, 100_00))).toEqual({ name: 'NotFoundError', status: 404 });
	});

	it('lets only the owner and the manager mark a payment', () => {
		const id = delivered();

		for (const ctx of [actors.driver, actors.carpenter, actors.admin]) {
			expect(refused(() => mark(id, 100_00, {}, ctx))).toEqual({
				name: 'ForbiddenError',
				status: 403
			});
		}
		expect(marksOf(id)).toEqual([]);
		expect(mark(id, 100_00, {}, actors.owner).status).toBe('awaiting_payment');
	});

	it('writes every mark into the audit journal without the comment text', () => {
		const id = delivered();

		mark(id, 500_00, { comment: 'Счёт 15' });

		const [row] = audit('payment.mark');
		expect(row).toMatchObject({
			actorId: ids.manager,
			entity: 'payment_marks',
			entityId: marksOf(id)[0]?.id,
			after: { requestId: id, amountMinor: 500_00, method: 'bank', status: 'awaiting_payment' }
		});
		expect(JSON.stringify(row?.after)).not.toContain('Счёт 15');
	});

	it('announces a partial payment once per request and a closing one as request.paid', () => {
		const id = delivered();

		mark(id, 100_00);
		mark(id, 200_00);
		expect(fanouts('request.payment_marked').map((job) => job.payload)).toEqual([
			{ eventKey: 'request.payment_marked', entityId: id }
		]);
		expect(fanouts('request.paid')).toEqual([]);

		mark(id, totalOf(id) - 300_00);
		expect(fanouts('request.payment_marked')).toHaveLength(1);
		expect(fanouts('request.paid').map((job) => job.payload)).toEqual([
			{ eventKey: 'request.paid', entityId: id }
		]);
	});

	it('keeps paid_minor equal to the cash the driver took at the door', () => {
		const id = assembled(1);
		const line = lineOf(id);
		delivery().load({ itemId: line.itemId, qty: line.qty });

		new RequestTransitionService(actors.driver).deliver(id, true);

		expect(statusOf(id)).toBe('paid');
		expect(paidColumn(id)).toBe(totalOf(id));
		expect(card(id).payments).toEqual([
			expect.objectContaining({ method: 'cash', amountMinor: totalOf(id), isReversed: false })
		]);
	});
});

describe('reversal of a payment mark (C7, tech.md v1.44)', () => {
	it('cancels a mark with a row of the opposite sign and gives the rest back', () => {
		const id = delivered();
		mark(id, 700_00, { method: 'card' });
		const [wrong] = marksOf(id);

		reverse(id, wrong?.id ?? 0);

		expect(marksOf(id)).toEqual([
			expect.objectContaining({ id: wrong?.id, amountMinor: 700_00 }),
			expect.objectContaining({
				amountMinor: -700_00,
				method: 'card',
				paidAt: wrong?.paidAt,
				comment: 'Ошибка в сумме',
				reversalOfId: wrong?.id
			})
		]);
		expect(paidColumn(id)).toBe(0);
		expect(card(id)).toMatchObject({ dueMinor: totalOf(id), status: 'awaiting_payment' });
		expect(card(id).payments?.map((row) => [row.amountMinor, row.isReversed])).toEqual([
			[-700_00, false],
			[700_00, true]
		]);
		expect(audit('payment.reverse')).toEqual([
			expect.objectContaining({ entity: 'payment_marks', actorId: ids.manager })
		]);
	});

	it('cancels a mark once and never cancels a reversal', () => {
		const id = delivered();
		mark(id, 700_00);
		const [wrong] = marksOf(id);
		reverse(id, wrong?.id ?? 0);
		const undo = marksOf(id)[1];

		expect(refused(() => reverse(id, wrong?.id ?? 0)).status).toBe(409);
		expect(refused(() => reverse(id, undo?.id ?? 0)).status).toBe(409);
		expect(marksOf(id)).toHaveLength(2);
	});

	it('needs a reason, and refuses a mark of another request', () => {
		const id = delivered();
		const other = delivered();
		mark(other, 300_00);
		const foreign = marksOf(other)[0]?.id ?? 0;

		expect(paymentReverseSchema.safeParse({ markId: '1', comment: '  ' }).success).toBe(false);
		expect(refused(() => reverse(id, foreign))).toEqual({ name: 'NotFoundError', status: 404 });
		expect(marksOf(other)).toHaveLength(1);
	});

	it('leaves the marks of a closed request alone: nothing moves back', () => {
		const id = delivered();
		mark(id, totalOf(id));

		expect(refused(() => reverse(id, marksOf(id)[0]?.id ?? 0)).status).toBe(409);
		expect(statusOf(id)).toBe('paid');
		expect(sumOf(id)).toBe(totalOf(id));
	});

	it('keeps the debt of the counterparty equal to the registry of marks', () => {
		const id = delivered();
		mark(id, 700_00);
		mark(id, 200_00);
		reverse(id, marksOf(id)[0]?.id ?? 0);

		const debt = new DebtRepository().of(world.cpId);

		expect(debt).toEqual({ debtMinor: totalOf(id) - 200_00, openCount: 1 });
	});
});

describe('payment mark form (C7)', () => {
	it('rejects a zero amount, an unknown method and a date that is not a date', () => {
		const base = { amountMinor: '100', paidAt: TODAY, method: 'bank' };

		expect(paymentMarkSchema.safeParse(base).success).toBe(true);
		expect(paymentMarkSchema.safeParse({ ...base, amountMinor: '0' }).success).toBe(false);
		expect(paymentMarkSchema.safeParse({ ...base, method: 'crypto' }).success).toBe(false);
		expect(paymentMarkSchema.safeParse({ ...base, paidAt: '01.10.2026' }).success).toBe(false);
		expect(paymentMarkSchema.safeParse({ ...base, comment: 'я'.repeat(501) }).success).toBe(false);
	});
});
