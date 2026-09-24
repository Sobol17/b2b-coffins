import { eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { NotFoundError } from '../../src/lib/server/core/errors';
import { CounterpartyAccessService } from '../../src/lib/server/crm-counterparty/counterparty-access.service';
import { CounterpartyDetailService } from '../../src/lib/server/crm-counterparty/counterparty-detail.service';
import { CounterpartyLedgerService } from '../../src/lib/server/crm-counterparty/counterparty-ledger.service';
import { CrmCounterpartyService } from '../../src/lib/server/crm-counterparty/crm-counterparty.service';
import {
	auditLog,
	deliveryAddresses,
	paymentMarks,
	requests
} from '../../src/lib/server/db/schema';
import { FakeMailDriver } from '../../src/lib/server/notifications/drivers/mail';
import { actorOf, counterpartyDatabase, newCounterparty } from './helpers/crm-counterparty';
import { insertUser } from './helpers/db';

const db = counterpartyDatabase();
const managerId = insertUser({
	email: 'manager@ws.example',
	role: 'manager',
	counterpartyId: null,
	fullName: 'Марина Круглова'
});
const ownerId = insertUser({ email: 'owner@ws.example', role: 'owner', counterpartyId: null });
const manager = actorOf('manager', managerId);
const cards = () => new CrmCounterpartyService(manager);
const details = () => new CounterpartyDetailService(manager);
const ledger = () => new CounterpartyLedgerService(manager);
const page = { page: 1, perPage: 50 };

let ownId = 0;
let otherId = 0;

function request(
	counterpartyId: number,
	number: string,
	status: string,
	totalMinor: number
): number {
	const [row] = db
		.insert(requests)
		.values({
			number,
			counterpartyId,
			createdById: ownerId,
			status: status as 'draft',
			totalMinor,
			submittedAt: status === 'draft' ? null : new Date()
		})
		.returning({ id: requests.id })
		.all();
	return row?.id ?? 0;
}

function mark(requestId: number, amountMinor: number): void {
	db.insert(paymentMarks)
		.values({ requestId, amountMinor, paidAt: new Date(), method: 'bank', createdById: managerId })
		.run();
}

beforeAll(async () => {
	const access = new CounterpartyAccessService(manager, new FakeMailDriver());
	ownId = (
		await access.create(
			newCounterparty({ name: 'Ритуал-Сервис', inn: '7702345678', managerId: String(managerId) })
		)
	).counterpartyId;
	otherId = (await access.create(newCounterparty({ name: 'Память', inn: '5001234567' })))
		.counterpartyId;
	const delivered = request(ownId, 'C3-1', 'delivered', 100_000);
	mark(delivered, 30_000);
	const awaiting = request(ownId, 'C3-2', 'awaiting_payment', 50_000);
	mark(awaiting, 10_000);
	mark(awaiting, 5_000);
	const paid = request(ownId, 'C3-3', 'paid', 20_000);
	mark(paid, 20_000);
	request(ownId, 'C3-4', 'in_work', 70_000);
	request(ownId, 'C3-5', 'draft', 90_000);
	request(otherId, 'C3-6', 'awaiting_payment', 555_000);
});

describe('debt indicator agrees with the registry of payment marks (C3 DoD)', () => {
	it('owes the unpaid rest of what was handed over', () => {
		// 100 000 - 30 000 + 50 000 - 15 000: in work and paid requests owe nothing.
		expect(cards().card(ownId).debt).toEqual({ debtMinor: 105_000, openCount: 2 });
	});

	it('equals the delivered totals minus the marks the card lists', () => {
		const history = ledger().requests(ownId, page).rows;
		const marks = ledger().payments(ownId, page).rows;
		const open = history.filter(
			(row) => row.status === 'delivered' || row.status === 'awaiting_payment'
		);
		const openIds = new Set(open.map((row) => row.id));
		const handedOver = open.reduce((sum, row) => sum + (row.totalMinor ?? 0), 0);
		const paidOnOpen = marks
			.filter((row) => openIds.has(row.requestId))
			.reduce((sum, row) => sum + row.amountMinor, 0);

		expect(cards().card(ownId).debt?.debtMinor).toBe(handedOver - paidOnOpen);
		expect(marks.map((row) => row.requestNumber).sort()).toEqual(['C3-1', 'C3-2', 'C3-2', 'C3-3']);
		expect(marks[0]).toMatchObject({ method: 'bank', createdByName: 'Марина Круглова' });
	});

	it('shows the paid sum of each request from the marks, never a draft', () => {
		const history = ledger().requests(ownId, page).rows;
		expect(history.map((row) => row.number)).not.toContain('C3-5');
		expect(history.find((row) => row.number === 'C3-2')).toMatchObject({
			totalMinor: 50_000,
			paidMinor: 15_000
		});
	});

	it('lists debtors with their debt and filters them', () => {
		const list = cards().list({ ...page, filters: { hasDebt: true } });
		expect(list.rows.map((row) => [row.name, row.debtMinor])).toEqual([
			['Память', 555_000],
			['Ритуал-Сервис', 105_000]
		]);
		expect(
			cards()
				.list({ ...page, search: '77023' })
				.rows.map((row) => row.name)
		).toEqual(['Ритуал-Сервис']);
		expect(cards().list({ ...page, filters: { managerId } }).rows).toEqual([
			expect.objectContaining({
				name: 'Ритуал-Сервис',
				managerName: 'Марина Круглова',
				staffCount: 1
			})
		]);
	});

	it('reads no history of an unknown counterparty', () => {
		expect(() => ledger().requests(999_999, page)).toThrow(NotFoundError);
		expect(() => cards().card(999_999)).toThrow(NotFoundError);
	});
});

describe('requisites, terms and notes', () => {
	it('journals the names of changed requisites, not their values', () => {
		const card = cards().card(ownId);
		cards().updateRequisites(ownId, {
			name: card.name,
			legalName: 'ООО «Ритуал-Сервис»',
			inn: card.inn,
			kpp: card.kpp,
			address: card.address,
			phone: '+7 900 000-00-00',
			email: 'office@rs.example'
		});
		const [entry] = db
			.select()
			.from(auditLog)
			.where(eq(auditLog.action, 'counterparty.update'))
			.all();
		expect(entry?.after).toEqual({ fields: ['legalName', 'phone', 'email'] });
		expect(JSON.stringify(entry)).not.toContain('office@rs.example');
	});

	it('changes the commercial terms and keeps the old ones in the journal', () => {
		const card = cards().updateTerms(ownId, {
			priceListId: null,
			discountPercent: 7,
			settlementScheme: 'monthly',
			managerId: ownerId,
			staffLimit: 5
		});
		expect(card).toMatchObject({
			discountPercent: 7,
			settlementScheme: 'monthly',
			managerId: ownerId,
			staffLimit: 5
		});
		const [entry] = db
			.select()
			.from(auditLog)
			.where(eq(auditLog.action, 'counterparty.terms_update'))
			.all();
		expect(entry?.before).toMatchObject({ discountPercent: 3, managerId });
	});

	it('keeps notes and journals only that they changed', () => {
		expect(cards().updateNotes(ownId, 'Звонить после 10').notes).toBe('Звонить после 10');
		const [entry] = db
			.select()
			.from(auditLog)
			.where(eq(auditLog.action, 'counterparty.notes_update'))
			.all();
		expect(entry?.after).toEqual({ hasNotes: true });
	});
});

describe('contracts and delivery addresses', () => {
	it('adds, edits and deletes a contract of this counterparty only', () => {
		const added = details().addContract(ownId, {
			number: '201-О',
			signedAt: '2026-01-10',
			validUntil: null
		});
		expect(
			cards()
				.card(ownId)
				.contracts.map((row) => row.number)
		).toContain('201-О');
		expect(
			details().updateContract(ownId, added.id, {
				number: '201-О/1',
				signedAt: '2026-01-10',
				validUntil: '2026-12-31'
			}).number
		).toBe('201-О/1');
		expect(() => details().deleteContract(otherId, added.id)).toThrow(NotFoundError);
		details().deleteContract(ownId, added.id);
		expect(cards().card(ownId).contracts).toEqual([]);
	});

	it('keeps one default address and removes softly', () => {
		const address = (title: string, isDefault: boolean) =>
			details().addAddress(ownId, {
				title,
				address: `${title}, 1`,
				contactName: null,
				contactPhone: null,
				isDefault
			});
		const first = address('Офис', true);
		const second = address('Склад', true);
		expect(
			cards()
				.card(ownId)
				.addresses.filter((row) => row.isDefault)
				.map((row) => row.id)
		).toEqual([second.id]);
		details().setDefaultAddress(ownId, first.id);
		expect(cards().card(ownId).addresses[0]).toMatchObject({ id: first.id, isDefault: true });

		details().removeAddress(ownId, first.id);
		expect(
			cards()
				.card(ownId)
				.addresses.map((row) => row.id)
		).toEqual([second.id]);
		const [kept] = db
			.select()
			.from(deliveryAddresses)
			.where(eq(deliveryAddresses.id, first.id))
			.all();
		expect(kept?.deletedAt).not.toBeNull();
		expect(() => details().removeAddress(otherId, second.id)).toThrow(NotFoundError);
	});
});
