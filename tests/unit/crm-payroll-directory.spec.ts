import { beforeEach, describe, expect, it } from 'vitest';
import { ForbiddenError, NotFoundError, ValidationError } from '../../src/lib/server/core/errors';
import { PayrollStaffService } from '../../src/lib/server/crm-payroll/payroll-staff.service';
import { WorkTypeService } from '../../src/lib/server/crm-payroll/work-type.service';
import { auditLog } from '../../src/lib/server/db/schema';
import { staffCreateSchema, workTypeCreateSchema } from '../../src/lib/validation/crm-payroll';
import { clearPayroll, payrollActor } from './helpers/crm-payroll';
import { insertUser, migratedDatabase } from './helpers/db';

const db = migratedDatabase();
const managerId = insertUser({
	email: 'manager@ws.example',
	role: 'manager',
	counterpartyId: null
});

const staff = (role: Parameters<typeof payrollActor>[1] = 'manager') =>
	new PayrollStaffService(payrollActor(managerId, role));
const works = (role: Parameters<typeof payrollActor>[1] = 'manager') =>
	new WorkTypeService(payrollActor(managerId, role));
const actions = () => db.select({ action: auditLog.action }).from(auditLog).all();

beforeEach(clearPayroll);

describe('who opens the payroll section', () => {
	it('lets the owner and the administrator in and nobody else', () => {
		for (const role of ['owner', 'manager'] as const) {
			expect(staff(role).list()).toEqual([]);
			expect(works(role).list()).toEqual([]);
		}
		for (const role of ['carpenter', 'painter', 'driver', 'cp_admin', 'cp_employee'] as const) {
			expect(() => staff(role)).toThrow(ForbiddenError);
			expect(() => works(role)).toThrow(ForbiddenError);
		}
	});
});

describe('the crew directory', () => {
	it('adds a worker and journals it without the name', () => {
		const worker = staff().create({ fullName: 'Алексей Дроздов', position: 'Столяр' });

		expect(staff().list()).toEqual([
			{
				...worker,
				fullName: 'Алексей Дроздов',
				position: 'Столяр',
				isActive: true,
				hasAccount: false
			}
		]);
		const [row] = db.select().from(auditLog).all();
		expect(row).toMatchObject({ action: 'staff.create', entity: 'staff', entityId: worker.id });
		expect(JSON.stringify(row)).not.toContain('Дроздов');
	});

	it('edits the name and the position', () => {
		const worker = staff().create({ fullName: 'Роман Тихонов', position: null });
		const edited = staff().update({ id: worker.id, fullName: 'Роман Тихонов', position: 'Маляр' });
		expect(edited.position).toBe('Маляр');
		expect(() => staff().update({ id: 999, fullName: 'Нет', position: null })).toThrow(
			NotFoundError
		);
	});

	it('switches a worker off instead of deleting, and lists the active first', () => {
		const first = staff().create({ fullName: 'Анна', position: null });
		staff().create({ fullName: 'Яков', position: null });
		staff().setActive(first.id, false);

		expect(
			staff()
				.list()
				.map((row) => [row.fullName, row.isActive])
		).toEqual([
			['Яков', true],
			['Анна', false]
		]);
		expect(actions().map((row) => row.action)).toContain('staff.disable');
		expect(staff().setActive(first.id, true).isActive).toBe(true);
	});

	it('requires a name', () => {
		expect(staffCreateSchema.safeParse({ fullName: '  ', position: '' }).success).toBe(false);
		expect(staffCreateSchema.parse({ fullName: ' Юрий Савин ', position: '' })).toEqual({
			fullName: 'Юрий Савин',
			position: null
		});
	});
});

describe('works and their prices', () => {
	it('keeps a work as a title and a price of one unit', () => {
		const work = works().create({ title: 'Сборка ящика', rateMinor: 20_000 });
		expect(works().list()).toEqual([
			{ id: work.id, title: 'Сборка ящика', rateMinor: 20_000, isActive: true }
		]);
		expect(actions()).toEqual([{ action: 'work_type.create' }]);
	});

	it('refuses a second work with the same title', () => {
		const work = works().create({ title: 'Шлифовка', rateMinor: 8_000 });
		expect(() => works().create({ title: 'Шлифовка', rateMinor: 9_000 })).toThrow(ValidationError);
		const other = works().create({ title: 'Лакировка', rateMinor: 12_000 });
		expect(() => works().update({ id: other.id, title: 'Шлифовка', rateMinor: 1_000 })).toThrow(
			ValidationError
		);
		// Saving a work under its own title is not a clash.
		expect(works().update({ id: work.id, title: 'Шлифовка', rateMinor: 9_000 }).rateMinor).toBe(
			9_000
		);
	});

	it('journals the old and the new price', () => {
		const work = works().create({ title: 'Обивка', rateMinor: 10_000 });
		works().update({ id: work.id, title: 'Обивка', rateMinor: 11_000 });
		const row = db.select().from(auditLog).all().at(-1);
		expect(row).toMatchObject({
			action: 'work_type.update',
			before: { title: 'Обивка', rateMinor: 10_000 },
			after: { title: 'Обивка', rateMinor: 11_000 }
		});
	});

	it('switches a work off and on', () => {
		const work = works().create({ title: 'Упаковка', rateMinor: 3_000 });
		expect(works().setActive(work.id, false).isActive).toBe(false);
		expect(works().list()[0]?.isActive).toBe(false);
		expect(() => works().setActive(999, true)).toThrow(NotFoundError);
	});

	it('takes a price in whole roubles only', () => {
		expect(workTypeCreateSchema.safeParse({ title: 'Раскрой', rateMinor: '15000' }).success).toBe(
			true
		);
		expect(workTypeCreateSchema.safeParse({ title: 'Раскрой', rateMinor: '15050' }).success).toBe(
			false
		);
		expect(workTypeCreateSchema.safeParse({ title: 'Раскрой', rateMinor: '-100' }).success).toBe(
			false
		);
	});
});
