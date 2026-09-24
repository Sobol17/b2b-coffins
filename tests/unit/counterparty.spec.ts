import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { PolicyService } from '../../src/lib/server/auth/policy';
import { ForbiddenError } from '../../src/lib/server/core/errors';
import { CounterpartyService } from '../../src/lib/server/counterparty/counterparty.service';
import {
	contracts,
	counterparties,
	paymentMarks,
	requests,
	users
} from '../../src/lib/server/db/schema';
import type { ActorContext } from '../../src/lib/types/actor';
import type { RoleCode } from '../../src/lib/types/roles';
import { insertCounterparty, insertUser, migratedDatabase } from './helpers/db';

const db = migratedDatabase();
const now = new Date('2026-09-15T12:00:00Z');

const managerId = insertUser({
	email: 'manager@workshop.example',
	role: 'manager',
	counterpartyId: null,
	fullName: 'Марина Круглова',
	phone: '+7 495 000-00-01'
});
const [own] = db
	.insert(counterparties)
	.values({
		name: 'Ритуал-Сервис',
		legalName: 'ООО «Ритуал-Сервис»',
		inn: '7702345678',
		kpp: '770201001',
		discountPercent: 4,
		staffLimit: 10,
		managerId
	})
	.returning()
	.all();
const ownId = own?.id ?? 0;
const otherId = insertCounterparty('Память');

const adminId = insertUser({
	email: 'admin@rs.example',
	role: 'cp_admin',
	counterpartyId: ownId,
	fullName: 'Пётр Ильин'
});
const employeeId = insertUser({
	email: 'employee@rs.example',
	role: 'cp_employee',
	counterpartyId: ownId,
	fullName: 'Ольга Гущина'
});
const goneId = insertUser({
	email: 'gone@rs.example',
	role: 'cp_employee',
	counterpartyId: ownId,
	fullName: 'Уволенный'
});
db.update(users).set({ isActive: false }).where(eq(users.id, goneId)).run();
const otherAdminId = insertUser({
	email: 'admin@pamyat.example',
	role: 'cp_admin',
	counterpartyId: otherId
});

db.insert(contracts)
	.values([
		{ counterpartyId: ownId, number: '114-О', signedAt: new Date('2024-03-12T00:00:00Z') },
		{ counterpartyId: ownId, number: '201-О', signedAt: new Date('2026-01-10T00:00:00Z') }
	])
	.run();

const thisYear = new Date('2026-05-01T00:00:00Z');
const created = { createdById: adminId };
db.insert(requests)
	.values([
		{
			...created,
			number: 'R-1',
			counterpartyId: ownId,
			status: 'delivered',
			totalMinor: 100_000,
			deliveredAt: thisYear
		},
		{
			...created,
			number: 'R-2',
			counterpartyId: ownId,
			status: 'awaiting_payment',
			totalMinor: 50_000,
			// A stale column must not clear the debt: only payment marks do (tech.md v1.39).
			paidMinor: 50_000,
			deliveredAt: thisYear
		},
		{
			...created,
			number: 'R-3',
			counterpartyId: ownId,
			status: 'paid',
			totalMinor: 20_000,
			paidMinor: 20_000,
			deliveredAt: thisYear
		},
		{
			...created,
			number: 'R-4',
			counterpartyId: ownId,
			status: 'paid',
			totalMinor: 999_000,
			paidMinor: 999_000,
			deliveredAt: new Date('2025-11-01T00:00:00Z')
		},
		{ ...created, number: 'R-5', counterpartyId: ownId, status: 'in_work', totalMinor: 70_000 },
		{
			...created,
			number: 'R-6',
			counterpartyId: otherId,
			status: 'awaiting_payment',
			totalMinor: 555_000,
			deliveredAt: thisYear
		}
	])
	.run();

const [firstDelivered] = db.select().from(requests).where(eq(requests.number, 'R-1')).all();
db.insert(paymentMarks)
	.values({
		requestId: firstDelivered?.id ?? 0,
		amountMinor: 30_000,
		paidAt: thisYear,
		method: 'bank',
		createdById: managerId
	})
	.run();

function actor(role: RoleCode, userId: number, counterpartyId: number | null): ActorContext {
	const roles = [role];
	return {
		userId,
		roles,
		scope: PolicyService.scopeOf(roles),
		counterpartyId,
		canSeePrices: PolicyService.canSeePrices(roles),
		canSeeCost: PolicyService.canSeeCost(roles),
		requestId: 'counterparty-test'
	};
}

// Requisites and the contract discount left the portal card in v1.33; the CRM card (C3) keeps them.
const CARD_FORBIDDEN_KEYS = [
	'legalName',
	'inn',
	'kpp',
	'address',
	'phone',
	'email',
	'settlementScheme',
	'discountPercent'
] as const;

describe('counterparty card', () => {
	it('gives the administrator the latest contract, the manager and the money figures', () => {
		const card = new CounterpartyService(actor('cp_admin', adminId, ownId)).card(now);

		expect(card).toMatchObject({
			name: 'Ритуал-Сервис',
			contract: { number: '201-О' },
			manager: { fullName: 'Марина Круглова', phone: '+7 495 000-00-01' },
			staffCount: 2,
			staffLimit: 10,
			// Unpaid rest of what was handed over, by the payment marks: 70 000 + 50 000.
			debtMinor: 120_000,
			// Handed over this year, paid or not: 100 000 + 50 000 + 20 000.
			yearPurchasesMinor: 170_000,
			yearDeliveries: 3
		});
		expect(card.staffPreview.map((member) => member.fullName).sort()).toEqual([
			'Ольга Гущина',
			'Пётр Ильин'
		]);
	});

	it('gives the employee the same card without any money', () => {
		const card = new CounterpartyService(actor('cp_employee', employeeId, ownId)).card(now);

		expect(card.name).toBe('Ритуал-Сервис');
		expect(JSON.stringify(card)).not.toContain('Minor');
		expect(card).not.toHaveProperty('yearDeliveries');
	});

	it('gives neither role the requisites nor the contract discount', () => {
		for (const ctx of [
			actor('cp_admin', adminId, ownId),
			actor('cp_employee', employeeId, ownId)
		]) {
			const keys = Object.keys(new CounterpartyService(ctx).card(now));
			for (const forbidden of CARD_FORBIDDEN_KEYS) {
				expect(keys).not.toContain(forbidden);
			}
		}
	});

	it('never mixes in another counterparty', () => {
		const card = new CounterpartyService(actor('cp_admin', otherAdminId, otherId)).card(now);

		expect(card).toMatchObject({
			name: 'Память',
			debtMinor: 555_000,
			staffCount: 1,
			contract: null,
			manager: null
		});
	});

	it('gives the shell the name and the manager', () => {
		expect(new CounterpartyService(actor('cp_employee', employeeId, ownId)).summary()).toEqual({
			name: 'Ритуал-Сервис',
			manager: {
				fullName: 'Марина Круглова',
				phone: '+7 495 000-00-01',
				email: 'manager@workshop.example'
			}
		});
	});

	it('refuses a workshop actor', () => {
		expect(() => new CounterpartyService(actor('manager', managerId, null)).card(now)).toThrow(
			ForbiddenError
		);
	});
});
