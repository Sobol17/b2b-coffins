import { OwnPayrollService } from '../../src/lib/server/crm-payroll/own-payroll.service';
import { PayrollCalendar } from '../../src/lib/server/crm-payroll/payroll-calendar';
import { payrollActor } from './helpers/crm-payroll';
import { expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { seedDeliveryWorld } from './helpers/crm-delivery';
import { insertUser, migratedDatabase } from './helpers/db';
import { RequestTransitionService } from '../../src/lib/server/request/request-transition.service';
import { payrollAccruals, staff } from '../../src/lib/server/db/schema';
const db = migratedDatabase();
const world = seedDeliveryWorld(db);
const other = insertUser({
	email: 'other-driver@example.test',
	role: 'driver',
	counterpartyId: null
});
it('requires the actual driver and accrues only that driver atomically with delivery', () => {
	const id = world.assembled(3);
	const line = world.lineOf(id);
	world.delivery().load({ itemId: line.itemId, qty: 3 });
	const service = new RequestTransitionService(world.actors.manager);
	expect(() => service.deliver(id, false)).toThrow();
	expect(() => service.deliver(id, false, world.ids.manager)).toThrow();
	service.deliver(id, false, other);
	const person = db.select().from(staff).where(eq(staff.userId, other)).get()!;
	expect(db.select().from(payrollAccruals).where(eq(payrollAccruals.sourceId, id)).all()).toEqual([
		expect.objectContaining({ staffId: person.id, source: 'delivery', qty: 3, rateMinor: 20000 })
	]);
	expect(
		new OwnPayrollService(payrollActor(other, 'driver')).week(new PayrollCalendar().today()).line
			?.accruedMinor
	).toBe(60000);
	expect(
		new OwnPayrollService(world.actors.driver).week(new PayrollCalendar().today()).line
			?.accruedMinor ?? 0
	).toBe(0);
	expect(() => service.deliver(id, false, other)).toThrow();
	expect(db.select().from(payrollAccruals).all()).toHaveLength(1);
});
