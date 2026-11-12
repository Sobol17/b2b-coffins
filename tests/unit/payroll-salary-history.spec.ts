import { afterEach, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { PayrollStaffService } from '../../src/lib/server/crm-payroll/payroll-staff.service';
import { PayrollWeekService } from '../../src/lib/server/crm-payroll/payroll-week.service';
import { PayrollReportService } from '../../src/lib/server/crm-payroll/payroll-report.service';
import { PayrollCalendar } from '../../src/lib/server/crm-payroll/payroll-calendar';
import { payrollPeriods, staff } from '../../src/lib/server/db/schema';
import { staffCreateSchema, staffUpdateSchema } from '../../src/lib/validation/crm-payroll';
import { payrollActor } from './helpers/crm-payroll';
import { insertUser, migratedDatabase } from './helpers/db';

const db = migratedDatabase();
const actor = payrollActor(
	insertUser({ email: 'salary-history@example.test', role: 'manager', counterpartyId: null })
);
const service = new PayrollStaffService(actor);
afterEach(() => vi.useRealTimers());

function clock(date: string) {
	vi.useFakeTimers();
	vi.setSystemTime(new Date(date + 'T12:00:00Z'));
}
function closeFixture(date: string) {
	const calendar = new PayrollCalendar();
	const start = calendar.weekStartOf(date);
	db.insert(payrollPeriods)
		.values({
			startsOn: calendar.instantOf(start),
			endsOn: calendar.instantOf(calendar.weekEndOf(start)),
			status: 'calculated'
		})
		.run();
}
it('rejects a laborer created on payday after that week was closed without changing report totals', () => {
	clock('2028-01-27');
	closeFixture('2028-01-27');
	expect(() =>
		service.create(staffCreateSchema.parse({ fullName: 'Closed payday', payRole: 'laborer' }))
	).toThrow('Неделя закрыта');
	expect(db.select().from(staff).where(eq(staff.fullName, 'Closed payday')).all()).toHaveLength(0);
	expect(
		new PayrollReportService(actor).report({ from: '2028-01-27', to: '2028-01-27' }).staff
	).toHaveLength(0);
});
it('rejects salary terms affecting a future payday in an already closed week', () => {
	clock('2028-02-24');
	const person = service.create(staffCreateSchema.parse({ fullName: 'Future payday' }));
	closeFixture('2028-02-27');
	expect(() => service.update(staffUpdateSchema.parse({ ...person, payRole: 'laborer' }))).toThrow(
		'Неделя закрыта'
	);
	expect(service.list().find((row) => row.id === person.id)?.payRole).toBe('piecework');
});
it('preserves the payday salary after edits and disabling, and uses the new rate next month', () => {
	clock('2028-03-26');
	const person = service.create(
		staffCreateSchema.parse({ fullName: 'Salary history', payRole: 'laborer' })
	);
	clock('2028-03-27');
	service.update(staffUpdateSchema.parse({ ...person, monthlySalaryMinor: 7000000 }));
	const amount = (date: string) =>
		new PayrollWeekService(actor).week(date).lines.find((row) => row.staffId === person.id)
			?.accruedMinor;
	expect(amount('2028-03-27')).toBe(6000000);
	clock('2028-04-27');
	expect(amount('2028-03-27')).toBe(6000000);
	expect(amount('2028-04-27')).toBe(7000000);
	service.setActive(person.id, false);
	clock('2028-05-27');
	expect(amount('2028-04-27')).toBe(7000000);
	expect(amount('2028-05-27') ?? 0).toBe(0);
});
