import { NotFoundError } from '../core/errors';
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

	create(input: StaffCreateInput): StaffDto {
		this.assertManage();
		return this.audited({ action: 'staff.create', entity: 'staff' }, (tx) => {
			const id = this.repo.insert(input, tx);
			return {
				result: PayrollDtoMapper.toStaff(this.require(id, tx)),
				entityId: id,
				after: { position: input.position }
			};
		});
	}

	/** @throws NotFoundError for an unknown worker. */
	update(input: StaffUpdateInput): StaffDto {
		this.assertManage();
		return this.audited({ action: 'staff.update', entity: 'staff' }, (tx) => {
			const before = this.require(input.id, tx);
			this.repo.update(input.id, { fullName: input.fullName, position: input.position }, tx);
			return {
				result: PayrollDtoMapper.toStaff(this.require(input.id, tx)),
				entityId: input.id,
				// Names are personal data: the journal keeps which fields moved, not the name itself.
				before: { position: before.position },
				after: { position: input.position, renamed: before.fullName !== input.fullName }
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
			return {
				result: PayrollDtoMapper.toStaff({ ...before, isActive }),
				entityId: id,
				before: { isActive: before.isActive },
				after: { isActive }
			};
		});
	}

	private require(id: number, tx: Tx): StaffRow {
		const row = this.repo.find(id, tx);
		if (!row) throw new NotFoundError('staff');
		return row;
	}
}
