import { BaseService } from '../core/service';
import { ValidationError } from '../core/errors';
import type { Tx } from '../db/client';
import type { ActorContext } from '$lib/types/actor';
import { DeliveryDriverRepository } from '../crm-delivery/delivery-driver.repository';
import { CompensationRepository } from './compensation.repository';
import { PayrollCalendar } from './payroll-calendar';
import { PayrollPeriodGate } from './payroll-period-gate';
import { PayrollStaffRepository } from './payroll-staff.repository';

/** Runs inside the audited production/delivery transaction; rates never depend on later edits. */
export class PayrollAccrualService extends BaseService {
	constructor(
		ctx: ActorContext,
		private readonly calendar = new PayrollCalendar()
	) {
		super(ctx);
	}

	production(jobId: number, qty: number, tx: Tx): void {
		const people = new PayrollStaffRepository()
			.all(tx)
			.filter((p) => p.isActive && (p.payRole === 'director' || p.payRole === 'administrator'));
		if (!people.length) return;
		const workDate = this.date(tx);
		const repo = new CompensationRepository(this.calendar);
		for (const person of people)
			repo.record(
				{
					staffId: person.id,
					source: 'production',
					sourceId: jobId,
					workDate,
					qty,
					rateMinor: person.payRole === 'director' ? 35000 : 30000
				},
				tx
			);
	}

	delivery(requestId: number, driverUserId: number | undefined, tx: Tx): number {
		const driver =
			driverUserId ?? (this.ctx.roles.includes('driver') ? this.ctx.userId : undefined);
		const repo = new DeliveryDriverRepository();
		if (driver === undefined || !repo.choices(tx).some((row) => row.id === driver))
			throw new ValidationError('Выберите действующего водителя в разделе «Доставка»', {
				field: 'driverUserId'
			});
		const people = new PayrollStaffRepository();
		const person = people.ensureForUser(driver, tx);
		if (person.payRole === 'laborer')
			throw new ValidationError('Разнорабочий не может быть водителем');
		if (person.payRole === 'piecework')
			people.update(person.id, { payRole: 'driver', position: person.position ?? 'Водитель' }, tx);
		new CompensationRepository(this.calendar).record(
			{
				staffId: person.id,
				source: 'delivery',
				sourceId: requestId,
				workDate: this.date(tx),
				qty: repo.quantity(requestId, tx),
				rateMinor: 20000
			},
			tx
		);
		return driver;
	}

	private date(tx: Tx): Date {
		const date = this.calendar.today();
		new PayrollPeriodGate(this.calendar).requireOpen(date, tx);
		return this.calendar.instantOf(date);
	}
}
