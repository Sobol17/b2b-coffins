import { eq } from 'drizzle-orm';
import ExcelJS from 'exceljs';
import { beforeEach, describe, expect, it } from 'vitest';
import { ForbiddenError } from '../../src/lib/server/core/errors';
import { CrmRequestExportService } from '../../src/lib/server/crm-request/crm-request-export.service';
import { CrmRequestListService } from '../../src/lib/server/crm-request/crm-request-list.service';
import { counterparties, requests } from '../../src/lib/server/db/schema';
import { ATTENTION_FLAGS, BOARD_STATUSES } from '../../src/lib/types/crm-request';
import type { RoleCode } from '../../src/lib/types/roles';
import { crew, crmQuery, insertRequest } from './helpers/crm-requests';
import { insertUser, migratedDatabase } from './helpers/db';
import { crmActor, portalActor, seedOrderingWorld } from './helpers/portal-requests';

const DAY_MS = 86_400_000;
const now = new Date('2026-09-24T12:00:00Z');
const db = migratedDatabase();
const world = seedOrderingWorld(db);
const managerId = insertUser({ email: 'mgr@ws.example', role: 'manager', counterpartyId: null });
const carpenterId = insertUser({
	email: 'carp@ws.example',
	role: 'carpenter',
	counterpartyId: null,
	fullName: 'Пётр Столяров'
});
const driverId = insertUser({ email: 'drv@ws.example', role: 'driver', counterpartyId: null });
const manager = crmActor('manager', managerId);
const service = () =>
	new CrmRequestListService(manager, undefined, undefined, undefined, 'Europe/Moscow', () => now);
const daysAgo = (days: number) => new Date(now.getTime() - days * DAY_MS);

beforeEach(() => {
	db.delete(requests).run();
});

describe('who reads the workshop requests (C4)', () => {
	it('lets only the owner and the manager in, and only inside the CRM', () => {
		const refused: RoleCode[] = ['carpenter', 'painter', 'driver', 'cp_admin', 'cp_employee'];
		for (const role of refused) {
			const ctx = role.startsWith('cp_')
				? portalActor(role, world.adminId, world.cpId)
				: crmActor(role, carpenterId);
			expect(() => new CrmRequestListService(ctx)).toThrow(ForbiddenError);
		}
		expect(() => new CrmRequestListService(crmActor('owner', managerId))).not.toThrow();
	});
});

describe('the registry of the workshop (C4)', () => {
	it('lists every counterparty and the stock, never a draft of the cart', () => {
		insertRequest({ status: 'draft', counterpartyId: world.cpId, createdById: world.adminId });
		const own = insertRequest({
			status: 'new',
			counterpartyId: world.cpId,
			createdById: world.adminId
		});
		const other = insertRequest({
			status: 'in_work',
			counterpartyId: world.otherCpId,
			createdById: managerId
		});
		const stock = insertRequest({ status: 'ready', counterpartyId: null, createdById: managerId });

		const page = service().list(crmQuery());
		expect(page.rows.map((row) => row.id).sort()).toEqual([own, other, stock].sort());
		expect(page.total).toBe(3);
		const stockRow = page.rows.find((row) => row.id === stock);
		expect(stockRow).toMatchObject({ isStockRequest: true, counterpartyName: null });
		expect(page.rows.find((row) => row.id === own)?.counterpartyName).toBe('Ритуал-Сервис');
	});

	it('filters by counterparty, the stock, the status and the priority', () => {
		const urgent = insertRequest({
			status: 'new',
			counterpartyId: world.cpId,
			createdById: managerId,
			priority: 'urgent'
		});
		insertRequest({ status: 'in_work', counterpartyId: world.cpId, createdById: managerId });
		const stock = insertRequest({ status: 'new', counterpartyId: null, createdById: managerId });

		const ids = (filters: Parameters<typeof crmQuery>[0]) =>
			service()
				.list(crmQuery(filters))
				.rows.map((row) => row.id);
		expect(ids({ stockOnly: true })).toEqual([stock]);
		expect(ids({ counterpartyId: world.cpId, status: 'new' })).toEqual([urgent]);
		expect(ids({ priority: 'urgent' })).toEqual([urgent]);
	});

	it('finds a request by number, counterparty name and the name of the deceased', () => {
		const target = insertRequest({
			status: 'new',
			counterpartyId: world.otherCpId,
			createdById: managerId,
			number: 'З-2026-00077',
			deceasedName: 'Петрова Анна Сергеевна'
		});
		insertRequest({ status: 'new', counterpartyId: world.cpId, createdById: managerId });
		for (const search of ['00077', 'память', 'петрова']) {
			expect(
				service()
					.list(crmQuery({}, { search }))
					.rows.map((row) => row.id)
			).toEqual([target]);
		}
	});

	it('sorts by the deadline and never by money for a role without prices', () => {
		const late = insertRequest({
			status: 'new',
			counterpartyId: world.cpId,
			createdById: managerId,
			deliveryAt: daysAgo(-5),
			totalMinor: 1
		});
		const soon = insertRequest({
			status: 'new',
			counterpartyId: world.cpId,
			createdById: managerId,
			deliveryAt: daysAgo(-1),
			totalMinor: 9
		});
		const byDeadline = service().list(crmQuery({}, { sort: 'deliveryAt', dir: 'asc' }));
		expect(byDeadline.rows.map((row) => row.id)).toEqual([soon, late]);

		const blind = { ...manager, canSeePrices: false };
		const page = new CrmRequestListService(
			blind,
			undefined,
			undefined,
			undefined,
			'UTC',
			() => now
		).list(crmQuery({}, { sort: 'total', dir: 'asc' }));
		expect(JSON.stringify(page)).not.toMatch(/Minor"/);
	});

	it('shows the paid amount from the payment marks and the crew by name', () => {
		const id = insertRequest({
			status: 'in_work',
			counterpartyId: world.cpId,
			createdById: managerId,
			totalMinor: 500_00
		});
		crew(id, carpenterId, 'carpenter');
		const [row] = service().list(crmQuery()).rows;
		expect(row).toMatchObject({
			totalMinor: 500_00,
			paidMinor: 0,
			assigneeNames: ['Пётр Столяров'],
			flags: []
		});
	});
});

describe('attention flags: the list and the filter agree (C4)', () => {
	it('finds with the filter exactly the rows that carry the flag', () => {
		db.update(counterparties)
			.set({ settlementScheme: 'monthly' })
			.where(eq(counterparties.id, world.otherCpId))
			.run();
		const lonely = insertRequest({
			status: 'in_work',
			counterpartyId: world.cpId,
			createdById: managerId
		});
		const noDriver = insertRequest({
			status: 'ready',
			counterpartyId: world.cpId,
			createdById: managerId
		});
		crew(noDriver, carpenterId, 'carpenter');
		const withDriver = insertRequest({
			status: 'ready',
			counterpartyId: null,
			createdById: managerId
		});
		crew(withDriver, driverId, 'driver');
		const overdue = insertRequest({
			status: 'awaiting_payment',
			counterpartyId: world.cpId,
			createdById: managerId,
			deliveredAt: daysAgo(4)
		});
		insertRequest({
			status: 'awaiting_payment',
			counterpartyId: world.otherCpId,
			createdById: managerId,
			deliveredAt: daysAgo(10)
		});

		const all = service().list(crmQuery()).rows;
		for (const flag of ATTENTION_FLAGS) {
			const flagged = all
				.filter((row) => row.flags.includes(flag))
				.map((row) => row.id)
				.sort();
			const found = service()
				.list(crmQuery({ flag }))
				.rows.map((row) => row.id)
				.sort();
			expect(found).toEqual(flagged);
		}
		expect(all.find((row) => row.id === lonely)?.flags).toEqual(['no_assignee']);
		expect(all.find((row) => row.id === noDriver)?.flags).toEqual(['no_assignee']);
		expect(all.find((row) => row.id === overdue)?.flags).toEqual(['payment_overdue']);
		db.update(counterparties)
			.set({ settlementScheme: 'on_fact' })
			.where(eq(counterparties.id, world.otherCpId))
			.run();
	});
});

describe('the board of the workshop (C4)', () => {
	it('draws six columns of the main flow, urgent first, then the nearest deadline', () => {
		const later = insertRequest({
			status: 'new',
			counterpartyId: world.cpId,
			createdById: managerId,
			deliveryAt: daysAgo(-3)
		});
		const none = insertRequest({
			status: 'new',
			counterpartyId: world.cpId,
			createdById: managerId
		});
		const sooner = insertRequest({
			status: 'new',
			counterpartyId: world.cpId,
			createdById: managerId,
			deliveryAt: daysAgo(-1)
		});
		const urgent = insertRequest({
			status: 'new',
			counterpartyId: world.cpId,
			createdById: managerId,
			priority: 'urgent',
			deliveryAt: daysAgo(-9)
		});
		insertRequest({ status: 'cancelled', counterpartyId: world.cpId, createdById: managerId });

		const board = service().board({});
		expect(board.columns.map((column) => column.status)).toEqual([...BOARD_STATUSES]);
		const fresh = board.columns[0];
		expect(fresh?.cards.map((card) => card.id)).toEqual([urgent, sooner, later, none]);
		expect(fresh?.total).toBe(4);
	});

	it('keeps only the last week in the paid column and ignores the status filter', () => {
		const recent = insertRequest({
			status: 'paid',
			counterpartyId: world.cpId,
			createdById: managerId,
			paidAt: daysAgo(2)
		});
		insertRequest({
			status: 'paid',
			counterpartyId: world.cpId,
			createdById: managerId,
			paidAt: daysAgo(30)
		});
		const board = service().board({ filters: { status: 'new' } });
		const paid = board.columns.find((column) => column.status === 'paid');
		expect(paid?.cards.map((card) => card.id)).toEqual([recent]);
		expect(paid?.total).toBe(1);
	});

	it('counts past the limit of a column', () => {
		for (let index = 0; index < 52; index += 1) {
			insertRequest({ status: 'in_work', counterpartyId: world.cpId, createdById: managerId });
		}
		const column = service()
			.board({})
			.columns.find((entry) => entry.status === 'in_work');
		expect(column?.cards).toHaveLength(50);
		expect(column?.total).toBe(52);
	});
});

describe('the registry as XLSX (C4)', () => {
	async function sheetOf(ctx: typeof manager, filters: Parameters<typeof crmQuery>[0] = {}) {
		const list = new CrmRequestListService(
			ctx,
			undefined,
			undefined,
			undefined,
			'Europe/Moscow',
			() => now
		);
		const body = await new CrmRequestExportService(ctx, list, 'Europe/Moscow').workbook(
			crmQuery(filters)
		);
		const workbook = new ExcelJS.Workbook();
		await workbook.xlsx.load(body as unknown as ArrayBuffer);
		const sheet = workbook.getWorksheet('Заявки');
		if (!sheet) throw new Error('no sheet');
		return sheet
			.getSheetValues()
			.filter(Boolean)
			.map((row) => (row as unknown[]).slice(1));
	}

	it('writes the filtered rows with whole rubles and without the name of the deceased', async () => {
		insertRequest({
			status: 'new',
			counterpartyId: world.cpId,
			createdById: managerId,
			number: 'З-2026-00100',
			totalMinor: 12_345_67,
			deceasedName: 'Сидоров Сидор'
		});
		insertRequest({
			status: 'ready',
			counterpartyId: null,
			createdById: managerId,
			number: 'З-2026-00101'
		});
		const rows = await sheetOf(manager, { status: 'new' });
		expect(rows[0]).toContain('Сумма, ₽');
		expect(rows).toHaveLength(2);
		expect(rows[1]).toEqual(
			expect.arrayContaining(['З-2026-00100', 'Заявка', 'Ритуал-Сервис', 12_346])
		);
		expect(JSON.stringify(rows)).not.toContain('Сидоров');
	});

	it('leaves the money columns out for a role without prices', async () => {
		insertRequest({
			status: 'new',
			counterpartyId: world.cpId,
			createdById: managerId,
			totalMinor: 5_00
		});
		const rows = await sheetOf({ ...manager, canSeePrices: false });
		expect(rows[0]).not.toContain('Сумма, ₽');
		expect(rows[1]).not.toContain(5);
	});

	it('refuses the crew and the portal', () => {
		expect(() => new CrmRequestExportService(crmActor('driver', driverId))).toThrow(ForbiddenError);
		expect(
			() => new CrmRequestExportService(portalActor('cp_admin', world.adminId, world.cpId))
		).toThrow(ForbiddenError);
	});
});
