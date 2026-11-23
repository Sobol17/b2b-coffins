import { CompensationRepository } from './compensation.repository';
import { NotFoundError, ValidationError } from '../core/errors';
import type { Tx } from '../db/client';
import { PayrollDtoMapper } from './dto';
import { PayrollBaseService } from './payroll-base.service';
import { PayrollStaffRepository, type StaffRow } from './payroll-staff.repository';
import type { ActorContext } from '$lib/types/actor';
import type { StaffDto } from '$lib/types/crm-payroll';
import type { StaffCreateInput, StaffUpdateInput } from '$lib/validation/crm-payroll';

/**
 * The crew directory of C10. A worker is switched off rather than deleted: days and payroll lines
 * keep pointing at the row.
 */
export class PayrollStaffService extends PayrollBaseService {
	constructor(
		ctx: ActorContext,
		private readonly repo: PayrollStaffRepository = new PayrollStaffRepository()
	) {
		super(ctx);
	}

	list(): StaffDto[] {
		return this.repo.all().map((row) => PayrollDtoMapper.toStaff(row));
	}

	userChoices(): { id: number; fullName: string }[] {
		this.assertManage();
		return this.repo.userChoices();
	}

	create(input: StaffCreateInput): StaffDto {
		this.assertManage();
		return this.audited({ action: 'staff.create', entity: 'staff' }, (tx) => {
			const userId = input.userId ?? null;
			this.assertUser(userId, null, tx);
			this.assertPayRole(input.payRole ?? 'piecework', userId);
			const id = this.repo.insert(
				{
					...input,
					userId,
					payRole: input.payRole ?? 'piecework',
					monthlySalaryMinor: input.monthlySalaryMinor ?? 6000000
				},
				tx
			);
			new CompensationRepository().salaryTerm(this.require(id, tx), true, tx);
			return {
				result: PayrollDtoMapper.toStaff(this.require(id, tx)),
				entityId: id,
				after: {
					position: input.position,
					userId,
					payRole: input.payRole,
					monthlySalaryMinor: input.monthlySalaryMinor
				}
			};
		});
	}

	/** @throws NotFoundError for an unknown worker. */
	update(input: StaffUpdateInput): StaffDto {
		this.assertManage();
		return this.audited({ action: 'staff.update', entity: 'staff' }, (tx) => {
			const before = this.require(input.id, tx);
			const userId = input.userId === undefined ? before.userId : input.userId;
			if (input.userId !== undefined) this.assertUser(userId, input.id, tx);
			const payRole = input.payRole ?? before.payRole;
			const monthlySalaryMinor = input.monthlySalaryMinor ?? before.monthlySalaryMinor;
			this.assertPayRole(payRole, userId);
			this.repo.update(
				input.id,
				{ fullName: input.fullName, position: input.position, userId, payRole, monthlySalaryMinor },
				tx
			);
			if (payRole !== before.payRole || monthlySalaryMinor !== before.monthlySalaryMinor)
				new CompensationRepository().salaryTerm(this.require(input.id, tx), false, tx);
			return {
				result: PayrollDtoMapper.toStaff(this.require(input.id, tx)),
				entityId: input.id,
				// Names are personal data: the journal keeps which fields moved, not the name itself.
				before: {
					position: before.position,
					userId: before.userId,
					payRole: before.payRole,
					monthlySalaryMinor: before.monthlySalaryMinor
				},
				after: {
					position: input.position,
					userId,
					payRole,
					monthlySalaryMinor,
					renamed: before.fullName !== input.fullName
				}
			};
		});
	}

	/** @throws NotFoundError for an unknown worker. */
	setActive(id: number, isActive: boolean): StaffDto {
		this.assertManage();
		const action = isActive ? 'staff.enable' : 'staff.disable';
		return this.audited({ action, entity: 'staff' }, (tx) => {
			const before = this.require(id, tx);
			this.repo.update(id, { isActive }, tx);
			if (before.isActive !== isActive)
				new CompensationRepository().salaryTerm({ ...before, isActive }, false, tx);
			return {
				result: PayrollDtoMapper.toStaff({ ...before, isActive }),
				entityId: id,
				before: { isActive: before.isActive },
				after: { isActive }
			};
		});
	}

	private assertPayRole(role: string, userId: number | null): void {
		if (role === 'laborer' && userId !== null)
			throw new ValidationError('Разнорабочий учитывается без учётной записи', { field: 'userId' });
	}

	private require(id: number, tx: Tx): StaffRow {
		const row = this.repo.find(id, tx);
		if (!row) throw new NotFoundError('staff');
		return row;
	}

	private assertUser(userId: number | null, exceptId: number | null, tx: Tx): void {
		if (userId === null) return;
		if (!this.repo.userExists(userId, tx))
			throw new ValidationError('Учётная запись мастерской не найдена или удалена', {
				field: 'userId'
			});
		if (this.repo.userTaken(userId, exceptId, tx))
			throw new ValidationError('Эта учётная запись уже связана с другим сотрудником', {
				field: 'userId'
			});
	}
}
