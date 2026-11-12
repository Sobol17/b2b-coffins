import ExcelJS from 'exceljs';
import { PayrollExportService } from '../../src/lib/server/crm-payroll/payroll-export.service';
import { describe, expect, it } from 'vitest';
import { PayrollStaffService } from '../../src/lib/server/crm-payroll/payroll-staff.service';
import { PayrollWeekService } from '../../src/lib/server/crm-payroll/payroll-week.service';
import { staffCreateSchema } from '../../src/lib/validation/crm-payroll';
import { calendarAt, payrollActor } from './helpers/crm-payroll';
import { insertUser, migratedDatabase } from './helpers/db';

migratedDatabase();
const actor = payrollActor(
	insertUser({ email: 'salary@example.test', role: 'manager', counterpartyId: null })
);

describe('monthly salary', () => {
	it('keeps the laborer payment role and defaults the monthly salary to 60000 roubles', () => {
		const input = staffCreateSchema.parse({ fullName: 'Подсобный рабочий', payRole: 'laborer' });
		const person = new PayrollStaffService(actor).create(input);
		expect(person).toMatchObject({ payRole: 'laborer', monthlySalaryMinor: 6000000, userId: null });
	});
	it('does not silently grant an account to a laborer', () => {
		const input = staffCreateSchema.parse({
			fullName: 'Рабочий',
			payRole: 'laborer',
			userId: actor.userId
		});
		expect(() => new PayrollStaffService(actor).create(input)).toThrow();
	});
});

import { staff, staffSalaryTerms, payrollAccruals } from '../../src/lib/server/db/schema';
import { database } from '../../src/lib/server/db/client';
import { PayrollCloseService } from '../../src/lib/server/crm-payroll/payroll-close.service';
import { PayrollReportService } from '../../src/lib/server/crm-payroll/payroll-report.service';

it('accrues salary on the 27th once, retains old terms, and closes a week without attendance', async () => {
	const person = database
		.insert(staff)
		.values({ fullName: 'Оклад', payRole: 'laborer' })
		.returning()
		.get()!;
	database
		.insert(staffSalaryTerms)
		.values([
			{ staffId: person.id, effectiveOn: '2026-10-01', amountMinor: 6000000 },
			{ staffId: person.id, effectiveOn: '2026-10-28', amountMinor: 7000000 }
		])
		.run();
	const line = (now: string, date = '2026-10-27') =>
		new PayrollWeekService(actor, calendarAt(now))
			.week(date)
			.lines.find((x) => x.staffId === person.id);
	expect(line('2026-10-26T12:00:00Z')?.accruedMinor).toBe(0);
	expect(line('2026-10-27T12:00:00Z')?.accruedMinor).toBe(6000000);
	expect(line('2026-11-27T12:00:00Z')?.accruedMinor).toBe(6000000);
	expect(line('2026-11-27T12:00:00Z', '2026-11-27')?.accruedMinor).toBe(7000000);
	new PayrollCloseService(actor, calendarAt('2026-11-02T12:00:00Z')).close('2026-10-27');
	expect(line('2026-11-27T12:00:00Z')?.accruedMinor).toBe(6000000);
	const report = new PayrollReportService(actor, calendarAt('2026-11-27T12:00:00Z')).report({
		from: '2026-10-01',
		to: '2026-11-30'
	});
	expect(report.staff.find((x) => x.staffId === person.id)?.accruedMinor).toBe(13000000);
	const exported = await new PayrollExportService(
		actor,
		new PayrollWeekService(actor, calendarAt('2026-11-27T12:00:00Z'))
	).sheet('2026-10-27');
	const book = new ExcelJS.Workbook();
	await book.xlsx.load(Uint8Array.from(exported.body).buffer);
	const sheet = book.getWorksheet('Ведомость')!;
	expect(sheet.getRow(2).getCell(1).value).toBe('Оклад');
	expect(sheet.getRow(2).getCell(4).value).toBe(60000);
});
it('includes frozen production and delivery earnings even after a staff member is disabled', () => {
	const person = database
		.insert(staff)
		.values({ fullName: 'Водитель', isActive: false })
		.returning()
		.get()!;
	database
		.insert(payrollAccruals)
		.values({
			staffId: person.id,
			source: 'delivery',
			sourceId: 1,
			workDate: calendarAt('2026-11-12T12:00:00Z').instantOf('2026-11-12'),
			qty: 3,
			rateMinor: 20000
		})
		.run();
	const week = new PayrollWeekService(actor, calendarAt('2026-11-12T12:00:00Z')).week('2026-11-12');
	expect(week.lines.find((x) => x.staffId === person.id)?.accruedMinor).toBe(60000);
});

import { PayrollAccrualService } from '../../src/lib/server/crm-payroll/payroll-accrual.service';
import { eq } from 'drizzle-orm';

it('pays each director and administrator for every produced piece without duplicate accruals', () => {
	const a = database
		.insert(staff)
		.values({ fullName: 'Олег', payRole: 'director' })
		.returning()
		.get()!;
	const b = database
		.insert(staff)
		.values({ fullName: 'Виталий', payRole: 'director' })
		.returning()
		.get()!;
	const c = database
		.insert(staff)
		.values({ fullName: 'Администратор', payRole: 'administrator' })
		.returning()
		.get()!;
	const service = new PayrollAccrualService(actor, calendarAt('2026-12-01T12:00:00Z'));
	database.transaction((tx) => {
		service.production(42, 3, tx);
		service.production(42, 3, tx);
	});
	const amounts = new PayrollWeekService(actor, calendarAt('2026-12-01T12:00:00Z')).week(
		'2026-12-01'
	).lines;
	expect([a, b, c].map((p) => amounts.find((x) => x.staffId === p.id)?.accruedMinor)).toEqual([
		105000, 105000, 90000
	]);
	expect(
		database.select().from(payrollAccruals).where(eq(payrollAccruals.sourceId, 42)).all()
	).toHaveLength(3);
});
