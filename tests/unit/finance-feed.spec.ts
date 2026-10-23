import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { summarize } from '../../src/lib/domain/finance/summary';
import { startOfDayInZone } from '../../src/lib/domain/time/zone';
import { ForbiddenError } from '../../src/lib/server/core/errors';
import { normalizeListQuery } from '../../src/lib/server/core/list';
import {
	charityTransfers,
	financeEntries,
	paymentMarks,
	payrollLines,
	payrollPeriods
} from '../../src/lib/server/db/schema';
import { toOperationDto } from '../../src/lib/server/finance/dto';
import { FinanceEntryService } from '../../src/lib/server/finance/finance-entry.service';
import { FinanceService } from '../../src/lib/server/finance/finance.service';
import type { FinanceFiltersInput } from '../../src/lib/validation/finance';
import { financeEntrySchema } from '../../src/lib/validation/finance';
import { insertCounterparty, insertUser, migratedDatabase } from './helpers/db';
import { insertStaff } from './helpers/crm-payroll';
import { insertRequest } from './helpers/crm-requests';
import { crmActor } from './helpers/portal-requests';

const db = migratedDatabase();
const TZ = 'Europe/Moscow';
const NOW = new Date('2026-11-15T09:00:00Z');
const ownerId = insertUser({ email: 'own@c18f.example', role: 'owner', counterpartyId: null });
const managerId = insertUser({ email: 'mgr@c18f.example', role: 'manager', counterpartyId: null });
const owner = crmActor('owner', ownerId);
const cpId = insertCounterparty('Ритуал-Тест');
const requestId = insertRequest({
	status: 'awaiting_payment',
	counterpartyId: cpId,
	createdById: ownerId,
	number: 'Т-07001'
});
const staffId = insertStaff('Иван Столяров');
const OCTOBER: FinanceFiltersInput = {
	from: '2026-10-01',
	to: '2026-10-31',
	kind: null,
	source: null
};

const finance = () => new FinanceService(owner, undefined, TZ, () => NOW);
const page = (filters: Partial<FinanceFiltersInput> = {}) =>
	finance().page({ ...OCTOBER, ...filters }, normalizeListQuery({ perPage: 100 }));
const day = (iso: string) => startOfDayInZone(iso, TZ) ?? new Date(Number.NaN);

function pay(amountMinor: number, paidAt: Date, reversalOfId?: number): number {
	const [row] = db
		.insert(paymentMarks)
		.values({
			requestId,
			amountMinor,
			paidAt,
			method: 'cash',
			createdById: ownerId,
			...(reversalOfId === undefined ? {} : { reversalOfId, comment: 'Ошибка' })
		})
		.returning({ id: paymentMarks.id })
		.all();
	return row?.id ?? 0;
}

function payout(payoutMinor: number, paidAt: Date | null): number {
	const [period] = db
		.insert(payrollPeriods)
		.values({ startsOn: day('2026-10-12'), endsOn: day('2026-10-18'), status: 'paid' })
		.onConflictDoNothing()
		.returning({ id: payrollPeriods.id })
		.all();
	const periodId =
		period?.id ?? db.select({ id: payrollPeriods.id }).from(payrollPeriods).all()[0]?.id ?? 0;
	const [line] = db
		.insert(payrollLines)
		.values({ periodId, staffId, accruedMinor: payoutMinor, payoutMinor, paidAt })
		.onConflictDoUpdate({
			target: [payrollLines.periodId, payrollLines.staffId],
			set: { payoutMinor, paidAt }
		})
		.returning({ id: payrollLines.id })
		.all();
	return line?.id ?? 0;
}

function transfer(amountMinor: number, at: Date, reversalOfId?: number): number {
	const [row] = db
		.insert(charityTransfers)
		.values({
			amountMinor,
			transferredAt: at,
			documentRef: 'ПП 15',
			createdById: ownerId,
			...(reversalOfId === undefined ? {} : { reversalOfId })
		})
		.returning({ id: charityTransfers.id })
		.all();
	return row?.id ?? 0;
}

const manual = (kind: 'income' | 'expense', amount: number, on: string, comment: string) =>
	new FinanceEntryService(owner, undefined, TZ, () => NOW).create(
		financeEntrySchema.parse({ kind, amountMinor: String(amount), occurredOn: on, comment })
	);

beforeEach(() => {
	db.delete(paymentMarks).run();
	db.delete(payrollLines).run();
	db.delete(payrollPeriods).run();
	db.delete(charityTransfers).run();
	db.delete(financeEntries).run();
});

describe('finance feed (C18, tech.md v1.58)', () => {
	it('shows a payment and its reversal and nets them to no income', () => {
		const id = pay(100_000, day('2026-10-05'));
		pay(-100_000, day('2026-10-05'), id);

		const result = page();

		expect(result.feed.rows.map((row) => [row.source, row.signedMinor])).toEqual([
			['order_payment', -100_000],
			['order_payment', 100_000]
		]);
		expect(result.summary.incomeMinor).toBe(0);
	});

	it('books a payout on the day it was marked and forgets it once unmarked', () => {
		const line = payout(250_000, day('2026-10-20'));
		expect(page().feed.rows).toEqual([
			expect.objectContaining({ source: 'payroll', kind: 'expense', signedMinor: -250_000 })
		]);
		expect(page().summary.expenseMinor).toBe(250_000);

		db.update(payrollLines).set({ paidAt: null }).where(eq(payrollLines.id, line)).run();
		expect(page().feed.total).toBe(0);
	});

	it('leaves a zero payout out', () => {
		payout(0, day('2026-10-20'));
		expect(page().feed.total).toBe(0);
	});

	it('takes a reversed transfer back off the expenses', () => {
		const id = transfer(50_000, day('2026-10-10'));
		transfer(-50_000, day('2026-10-10'), id);

		const result = page();

		expect(result.feed.rows.map((row) => row.signedMinor).sort()).toEqual([-50_000, 50_000]);
		expect(result.summary.expenseMinor).toBe(0);
	});

	it('hides a deleted manual entry from the feed and the totals', () => {
		const id = manual('expense', 300_000, '2026-10-07', 'Доски');
		db.update(financeEntries).set({ deletedAt: NOW }).where(eq(financeEntries.id, id)).run();

		expect(page().feed.total).toBe(0);
		expect(page().summary.expenseMinor).toBe(0);
	});

	it('cuts the period in the workshop zone', () => {
		pay(1_000, new Date('2026-10-31T20:30:00Z'));
		pay(2_000, new Date('2026-10-31T21:10:00Z'));

		const result = page();

		expect(result.feed.rows.map((row) => row.signedMinor)).toEqual([1_000]);
		expect(result.feed.rows[0]?.occurredOn).toBe('2026-10-31');
	});

	it('filters the feed by kind and source and counts after the filter', () => {
		pay(100_000, day('2026-10-05'));
		payout(250_000, day('2026-10-20'));
		transfer(50_000, day('2026-10-10'));
		manual('income', 20_000, '2026-10-06', 'Обрезки');
		manual('expense', 30_000, '2026-10-07', 'Бензин');

		const expenses = page({ kind: 'expense' });
		expect(expenses.feed.rows.map((row) => row.source).sort()).toEqual([
			'charity',
			'manual_expense',
			'payroll'
		]);
		expect(expenses.feed.total).toBe(3);
		expect(page({ source: 'manual_income' }).feed.rows.map((row) => row.title)).toEqual([
			'Обрезки'
		]);
		// The analytics read the whole period whatever the feed shows.
		expect(expenses.summary).toEqual(page().summary);
		expect(page().summary).toMatchObject({ incomeMinor: 120_000, expenseMinor: 330_000 });
	});

	it('orders the feed by day, newest first', () => {
		manual('expense', 1_000, '2026-10-02', 'Первая');
		manual('expense', 2_000, '2026-10-09', 'Вторая');
		manual('expense', 3_000, '2026-10-09', 'Третья');

		expect(page().feed.rows.map((row) => row.title)).toEqual(['Третья', 'Вторая', 'Первая']);
	});

	it('pages the feed and keeps the total', () => {
		for (let i = 1; i <= 3; i += 1) manual('expense', i * 100, '2026-10-02', `Строка ${i}`);

		const second = finance().page(OCTOBER, normalizeListQuery({ page: 2, perPage: 2 }));

		expect(second.feed).toMatchObject({ total: 3, page: 2, perPage: 2 });
		expect(second.feed.rows).toHaveLength(1);
	});

	it('agrees with the pure summary of the same lines', () => {
		pay(100_000, day('2026-10-05'));
		payout(250_000, day('2026-10-20'));
		manual('income', 20_000, '2026-10-06', 'Обрезки');

		const result = page();
		const lines = result.feed.rows.map((row) => ({
			source: row.source,
			occurredOn: row.occurredOn,
			signedMinor: row.signedMinor
		}));
		expect(result.summary).toEqual(summarize(lines, OCTOBER));
	});

	it('links an automatic line to its source and lets only a manual one be edited', () => {
		pay(100_000, day('2026-10-05'));
		payout(250_000, day('2026-10-20'));
		transfer(50_000, day('2026-10-10'));
		const id = manual('expense', 30_000, '2026-10-07', 'Бензин');

		const bySource = Object.fromEntries(page().feed.rows.map((row) => [row.source, row]));

		expect(bySource.order_payment).toMatchObject({
			title: 'Заявка №Т-07001',
			detail: 'Наличные',
			href: `/crm/requests/${requestId}`,
			manualId: null
		});
		expect(bySource.payroll).toMatchObject({
			title: 'Выплата: Иван Столяров',
			detail: 'неделя 12.10–18.10',
			href: '/crm/payroll?week=2026-10-12',
			manualId: null
		});
		expect(bySource.charity).toMatchObject({
			title: 'Перечисление в фонд',
			detail: 'ПП 15',
			href: '/crm/reports/charity'
		});
		expect(bySource.manual_expense).toMatchObject({
			key: `manual_expense:${id}`,
			title: 'Бензин',
			detail: null,
			href: null,
			manualId: id
		});
	});

	it('marks a reversal in the description', () => {
		const id = pay(100_000, day('2026-10-05'));
		pay(-100_000, day('2026-10-05'), id);
		const [reversal] = page().feed.rows;
		expect(reversal?.detail).toBe('Сторно оплаты, наличные');
		expect(
			toOperationDto(
				{
					source: 'charity',
					id: 1,
					occurredAt: day('2026-10-10'),
					signedMinor: 500,
					requestId: null,
					requestNumber: null,
					method: null,
					isReversal: true,
					staffName: null,
					weekStartsAt: null,
					weekEndsAt: null,
					documentRef: null,
					comment: null
				},
				TZ
			).detail
		).toBe('Сторно перечисления');
	});

	it('is closed to every role but the owner', () => {
		expect(() => new FinanceService(crmActor('manager', managerId))).toThrow(ForbiddenError);
	});
});
