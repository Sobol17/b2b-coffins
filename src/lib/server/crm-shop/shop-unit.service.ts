import { ConflictError, ForbiddenError, NotFoundError } from '../core/errors';
import { PayrollCalendar } from '../crm-payroll/payroll-calendar';
import { PayrollPeriodGate } from '../crm-payroll/payroll-period-gate';
import { PayrollStaffRepository } from '../crm-payroll/payroll-staff.repository';
import { ShopBaseService } from './shop-base.service';
import { ShopJobRepository } from './shop-job.repository';
import { ShopUnitRepository } from './shop-unit.repository';
import { ShopUnitWorkRepository } from './shop-unit-work.repository';
import type { ActorContext } from '$lib/types/actor';
import type { Tx } from '../db/client';

/** Claims and completion belong to a piece, never to the whole request. */
export class ShopUnitService extends ShopBaseService {
	constructor(
		ctx: ActorContext,
		private readonly calendar = new PayrollCalendar(),
		private readonly units = new ShopUnitRepository(),
		private readonly works = new ShopUnitWorkRepository(),
		private readonly people = new PayrollStaffRepository(),
		private readonly jobs = new ShopJobRepository()
	) {
		super(ctx);
	}

	take(unitId: number): void {
		this.audited({ action: 'shop.unit.take', entity: 'shop_units' }, (tx) => {
			const unit = this.require(unitId, tx);
			const previous = this.works.find(unitId, unit.station, tx);
			if (previous && previous.userId !== this.ctx.userId)
				throw new ConflictError('Изделие уже взял другой работник');
			if (!previous) {
				const person = this.people.ensureForUser(this.ctx.userId, tx);
				this.works.claim(
					{
						unitId,
						taskId: unit.taskId,
						station: unit.station,
						staffId: person.id,
						takenAt: this.calendar.moment()
					},
					tx
				);
				if (this.works.find(unitId, unit.station, tx)?.userId !== this.ctx.userId)
					throw new ConflictError('Изделие уже взял другой работник');
				this.jobs.takeTask(unit.taskId, this.ctx.userId, this.calendar.moment(), tx);
			}
			return { result: undefined, entityId: unitId };
		});
	}

	complete(unitId: number): void {
		this.audited({ action: 'shop.unit.complete', entity: 'shop_units' }, (tx) => {
			const unit = this.require(unitId, tx);
			const held = this.works.find(unitId, unit.station, tx);
			if (!held) throw new ConflictError('Сначала возьмите изделие в работу');
			const head = this.ctx.roles.includes('owner') || this.ctx.roles.includes('manager');
			if (!head && held.userId !== this.ctx.userId) throw new ForbiddenError('shop.work');
			if (held.work.completedAt !== null) return { result: undefined, entityId: unitId };
			const rate = this.works.rate(unit.variantId, unit.station, tx);
			if (!rate)
				throw new ConflictError(
					'Администратор должен заполнить расценку этой роли для позиции изделия'
				);
			const date = this.calendar.today();
			new PayrollPeriodGate(this.calendar).requireOpen(date, tx);
			this.works.complete(
				held.work.id,
				rate,
				this.calendar.moment(),
				this.calendar.instantOf(date),
				tx
			);
			this.jobs.setDone(unit.jobId, this.units.done(unit.jobId, unit.station, tx), tx);
			return {
				result: undefined,
				entityId: unitId,
				after: { workId: held.work.id, staffId: held.work.staffId }
			};
		});
	}

	private require(id: number, tx: Tx) {
		const unit = this.units.find(id, tx);
		if (!unit) throw new NotFoundError('shop unit');
		this.requireTask(unit.taskId, tx);
		if (unit.finishedAt || unit.completedAt) throw new ConflictError('Изделие уже передано дальше');
		if (unit.legacyDone) throw new ConflictError('Изделие уже отмечено вручную');
		return unit;
	}
}
