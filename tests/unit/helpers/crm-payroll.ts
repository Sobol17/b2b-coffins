import { database } from '../../../src/lib/server/db/client';
import {
	auditLog,
	jobQueue,
	payrollLines,
	payrollPeriods,
	staff,
	workDayStaff,
	workDays,
	workEntries,
	workTypes
} from '../../../src/lib/server/db/schema';
import { PolicyService } from '../../../src/lib/server/auth/policy';
import { PayrollCalendar } from '../../../src/lib/server/crm-payroll/payroll-calendar';
import type { ActorContext } from '../../../src/lib/types/actor';
import type { RoleCode } from '../../../src/lib/types/roles';

export function payrollActor(userId: number, role: RoleCode = 'manager'): ActorContext {
	const roles = [role];
	return {
		userId,
		roles,
		scope: PolicyService.scopeOf(roles),
		counterpartyId: null,
		canSeePrices: PolicyService.canSeePrices(roles),
		canSeeCost: PolicyService.canSeeCost(roles),
		requestId: 'payroll-test'
	};
}

/** A week closed on Mondays in Moscow time, with the clock the test sets. */
export function calendarAt(now: string): PayrollCalendar {
	return new PayrollCalendar('Europe/Moscow', 1, () => new Date(now));
}

export function insertStaff(fullName: string, isActive = true): number {
	const [row] = database.insert(staff).values({ fullName, isActive }).returning().all();
	if (!row) throw new Error(`failed to insert staff ${fullName}`);
	return row.id;
}

export function insertWorkType(title: string, rateMinor: number, isActive = true): number {
	const [row] = database.insert(workTypes).values({ title, rateMinor, isActive }).returning().all();
	if (!row) throw new Error(`failed to insert work type ${title}`);
	return row.id;
}

export function clearPayroll(): void {
	database.delete(auditLog).run();
	database.delete(jobQueue).run();
	database.delete(payrollLines).run();
	database.delete(payrollPeriods).run();
	database.delete(workEntries).run();
	database.delete(workDayStaff).run();
	database.delete(workDays).run();
	database.delete(workTypes).run();
	database.delete(staff).run();
}
