import { ConflictError, ValidationError } from '../core/errors';
import { ShopUnitWorkRepository } from '../crm-shop/shop-unit-work.repository';
import { PayrollBaseService } from './payroll-base.service';
import { PayrollCalendar } from './payroll-calendar';
import { PayrollPeriodGate } from './payroll-period-gate';
import { WorkDayRepository } from './work-day.repository';
import { WorkDayService } from './work-day.service';
import type { ActorContext } from '$lib/types/actor';
import type { WorkDaySaveInput } from '$lib/validation/crm-payroll';

/** Confirms each completed station work once, in the same transaction as its payroll entry. */
export class WorkDayConfirmService extends PayrollBaseService {
	constructor(
		ctx: ActorContext,
		private readonly calendar = new PayrollCalendar(),
		private readonly days = new WorkDayRepository(),
		private readonly works = new ShopUnitWorkRepository()
	) {
		super(ctx);
		this.assertManage();
	}

	confirm(date: string, input?: WorkDaySaveInput): void {
		this.audited({ action: 'payroll.day.confirm', entity: 'work_days' }, (tx) => {
			if (input) {
				if (input.date !== date) throw new ValidationError('Дата формы не совпадает с днём');
				new WorkDayService(this.ctx, this.calendar).save(input, tx);
			}
			const at = this.calendar.instantOf(date);
			if (date > this.calendar.today())
				throw new ValidationError('Будущий день подтвердить нельзя');
			new PayrollPeriodGate(this.calendar).requireOpen(date, tx);
			const pending = this.works.pending(at, at, tx);
			const day = this.days.findByDate(at, tx);
			const carpenters = day ? this.days.carpenterIdsOf(day.id, tx) : [];
			if (pending.some((row) => row.work.station === 'carpenter') && !carpenters.length)
				throw new ConflictError('Сначала отметьте столярную бригаду дня');
			const totalMinor =
				(day?.totalMinor ?? 0) + pending.reduce((sum, row) => sum + row.work.rateMinor, 0);
			if (!pending.length)
				return { result: undefined, entityId: day?.id ?? null, after: { confirmed: 0 } };
			const dayId = this.days.save({ workDate: at, totalMinor, createdById: this.ctx.userId }, tx);
			const present = new Set(this.days.staffIdsOf(dayId, tx));
			for (const { work } of pending) {
				if (work.workTypeId === null) throw new ConflictError('У выполненной работы нет расценки');
				const crew = work.station === 'carpenter' ? carpenters : [work.staffId];
				for (const id of crew) present.add(id);
				this.days.insertAutomatic(dayId, work.id, work.workTypeId, work.rateMinor, crew, tx);
				this.works.confirm(work.id, this.ctx.userId, this.calendar.moment(), tx);
			}
			this.days.replaceStaff(dayId, [...present], tx, carpenters);
			return { result: undefined, entityId: dayId, after: { confirmed: pending.length } };
		});
	}
}
