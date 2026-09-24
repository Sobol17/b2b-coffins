import fc from 'fast-check';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { counterpartyDebt, type DebtRequest } from '../../src/lib/domain/payment/debt';
import { DebtRepository } from '../../src/lib/server/counterparty/debt.repository';
import { counterparties, paymentMarks, requests } from '../../src/lib/server/db/schema';
import { REQUEST_STATUSES } from '../../src/lib/types/request';
import { insertCounterparty, insertUser, migratedDatabase } from './helpers/db';

const db = migratedDatabase();
const authorId = insertUser({ email: 'debt@ws.example', role: 'manager', counterpartyId: null });
const ids = [
	insertCounterparty('Первый'),
	insertCounterparty('Второй'),
	insertCounterparty('Третий')
];
const repo = new DebtRepository();
let sequence = 0;

const request = fc.record({
	owner: fc.constantFrom(...ids),
	status: fc.constantFrom(...REQUEST_STATUSES),
	totalMinor: fc.integer({ min: 0, max: 900_000_00 }),
	marksMinor: fc.array(fc.integer({ min: 1, max: 500_000_00 }), { maxLength: 4 })
});

function store(rows: readonly (DebtRequest & { owner: number })[]): void {
	db.delete(requests).run();
	for (const row of rows) {
		sequence += 1;
		const [created] = db
			.insert(requests)
			.values({
				number: `D-${sequence}`,
				counterpartyId: row.owner,
				createdById: authorId,
				status: row.status,
				totalMinor: row.totalMinor,
				// Deliberately wrong: the indicator must follow the marks, never this column.
				paidMinor: row.totalMinor
			})
			.returning({ id: requests.id })
			.all();
		for (const amountMinor of row.marksMinor) {
			db.insert(paymentMarks)
				.values({
					requestId: created?.id ?? 0,
					amountMinor,
					paidAt: new Date(),
					method: 'bank',
					createdById: authorId
				})
				.run();
		}
	}
}

describe('debt indicator against the registry of payment marks (C3 DoD)', () => {
	it('matches the domain fold over the marks for every counterparty', () => {
		expect(() =>
			fc.assert(
				fc.property(fc.array(request, { maxLength: 12 }), (rows) => {
					store(rows);
					const debts = repo.byCounterparty(ids);
					const debtors = new Set(
						db
							.select({ id: counterparties.id })
							.from(counterparties)
							.where(repo.debtorsWhere())
							.all()
							.map((row) => row.id)
					);
					for (const id of ids) {
						const expected = counterpartyDebt(rows.filter((row) => row.owner === id));
						const actual = debts.get(id) ?? { debtMinor: 0, openCount: 0 };
						expect(actual).toEqual(expected);
						expect(debtors.has(id)).toBe(expected.debtMinor > 0);
					}
				}),
				{ numRuns: 40 }
			)
		).not.toThrow();
	});

	it('reads zero for a counterparty without open requests', () => {
		store([]);
		expect(repo.of(ids[0] ?? 0)).toEqual({ debtMinor: 0, openCount: 0 });
		expect(
			db
				.select()
				.from(requests)
				.where(eq(requests.counterpartyId, ids[0] ?? 0))
				.all()
		).toEqual([]);
	});
});
