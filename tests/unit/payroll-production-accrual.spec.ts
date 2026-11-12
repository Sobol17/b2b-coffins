import { expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { ShopTaskService } from '../../src/lib/server/crm-shop/shop-task.service';
import { payrollAccruals, shopTasks, stockMoves, staff } from '../../src/lib/server/db/schema';
import { seedShopWorld } from './helpers/crm-shop';
import { migratedDatabase } from './helpers/db';
import { syncPayrollStaff } from '../../scripts/seed/payroll-staff';
import { PayrollCalendar } from '../../src/lib/server/crm-payroll/payroll-calendar';
import { PayrollCloseService } from '../../src/lib/server/crm-payroll/payroll-close.service';

const db = migratedDatabase();
const world = seedShopWorld(db, 'payroll-production');
syncPayrollStaff(db);
syncPayrollStaff(db);
const service = new ShopTaskService(world.actors.manager);

it('accrues each recipient only after the final station and rolls back a release in a closed week', () => {
	const id = world.inWork(3);
	let finalTask = 0;
	for (const station of ['carpenter', 'grinder', 'painter', 'upholsterer']) {
		const job = world.jobsOf(id).find((row) => row.station === station)!;
		expect(db.select().from(payrollAccruals).all()).toHaveLength(0);
		service.progress({ jobId: job.id, doneQty: job.qty });
		service.complete(job.taskId);
		finalTask = job.taskId;
	}
	const amounts = db
		.select({ name: staff.systemKey, qty: payrollAccruals.qty, rate: payrollAccruals.rateMinor })
		.from(payrollAccruals)
		.innerJoin(staff, eq(staff.id, payrollAccruals.staffId))
		.all();
	expect(amounts).toEqual(
		expect.arrayContaining([
			{ name: 'director-oleg', qty: 3, rate: 35000 },
			{ name: 'director-vitaliy', qty: 3, rate: 35000 },
			{ name: 'administrator', qty: 3, rate: 30000 }
		])
	);
	expect(amounts).toHaveLength(3);
	expect(() => service.complete(finalTask)).toThrow();
	expect(db.select().from(payrollAccruals).all()).toHaveLength(3);
	new PayrollCloseService(world.actors.manager).close(new PayrollCalendar().today());
	const another = world.inWork(1);
	for (const station of ['carpenter', 'grinder', 'painter']) {
		const job = world.jobsOf(another).find((row) => row.station === station)!;
		service.progress({ jobId: job.id, doneQty: job.qty });
		service.complete(job.taskId);
	}
	const job = world.jobsOf(another).find((row) => row.station === 'upholsterer')!;
	service.progress({ jobId: job.id, doneQty: job.qty });
	const moves = db.select().from(stockMoves).where(eq(stockMoves.type, 'production')).all().length;
	expect(() => service.complete(job.taskId)).toThrow('Неделя закрыта');
	expect(
		db.select().from(shopTasks).where(eq(shopTasks.id, job.taskId)).get()?.completedAt
	).toBeNull();
	expect(db.select().from(stockMoves).where(eq(stockMoves.type, 'production')).all()).toHaveLength(
		moves
	);
	expect(db.select().from(payrollAccruals).all()).toHaveLength(3);
});
