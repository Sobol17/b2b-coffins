import { eq } from 'drizzle-orm';
import { ShopService } from '../../../src/lib/server/crm-shop/shop.service';
import { ShopUnitService } from '../../../src/lib/server/crm-shop/shop-unit.service';
import { WorkDayConfirmService } from '../../../src/lib/server/crm-payroll/work-day-confirm.service';
import { WorkDayService } from '../../../src/lib/server/crm-payroll/work-day.service';
import { OwnPayrollService } from '../../../src/lib/server/crm-payroll/own-payroll.service';
import {
	shopTasks,
	shopUnitWorks,
	shopUnits,
	staff,
	workEntries,
	workTypes
} from '../../../src/lib/server/db/schema';
import { seedShopWorld } from './crm-shop';
import { calendarAt, clearPayroll } from './crm-payroll';
import { insertUser, migratedDatabase } from './db';
import { crmActor, resetRequests } from './portal-requests';

export const db = migratedDatabase();
export const world = seedShopWorld(db, 'units');
export const second = crmActor(
	'carpenter',
	insertUser({
		email: 'second@units.example',
		role: 'carpenter',
		counterpartyId: null,
		fullName: 'Другой столяр'
	})
);
export const DAY = '2026-10-11';
export const calendar = () => calendarAt('2026-10-11T15:00:00Z');
export const units = (actor = world.actors.carpenter) => new ShopUnitService(actor, calendar());
export const days = () => new WorkDayService(world.actors.manager, calendar());
export const confirm = () => new WorkDayConfirmService(world.actors.manager, calendar());
export const salary = (actor = world.actors.carpenter) => new OwnPayrollService(actor, calendar());

export function job(station: 'carpenter' | 'grinder' = 'carpenter', qty = 1) {
	const id = world.forStock(qty);
	const [row] = world.jobsOf(id);
	if (!row) throw new Error('missing test job');
	if (station !== 'carpenter')
		db.update(shopTasks).set({ station }).where(eq(shopTasks.id, row.taskId)).run();
	const actor = station === 'carpenter' ? world.actors.carpenter : world.actors.grinder;
	const task = new ShopService(actor).task(row.taskId);
	return { ...row, requestId: id, units: task.jobs[0]?.units ?? [] };
}

export function staffOf(userId: number): number {
	const row = db.select().from(staff).where(eq(staff.userId, userId)).get();
	if (!row) throw new Error('missing linked staff');
	return row.id;
}

export function resetUnitPayroll(): void {
	db.delete(workEntries).run();
	db.delete(shopUnitWorks).run();
	db.delete(shopUnits).run();
	resetRequests(db);
	clearPayroll();
	for (const [roleCode, rateMinor] of [
		['carpenter', 85_000],
		['grinder', 40_000]
	] as const) {
		db.insert(workTypes)
			.values({ title: `Расценка ${roleCode}`, roleCode, rateMinor, variantId: world.volga })
			.run();
	}
}
