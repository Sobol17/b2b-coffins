import type { LineRow } from './payroll-period.repository';
import type { StaffRow } from './payroll-staff.repository';
import type { PayrollLineDto, StaffDto } from '$lib/types/crm-payroll';

/** Rows of the payroll to the DTOs of tech.md §8. */
export class PayrollDtoMapper {
	static toStaff(row: StaffRow): StaffDto {
		return {
			id: row.id,
			fullName: row.fullName,
			position: row.position,
			isActive: row.isActive,
			hasAccount: row.userId !== null
		};
	}

	/** A frozen line of a closed week, as stored. */
	static toLine(row: LineRow): PayrollLineDto {
		return {
			id: row.id,
			staffId: row.staffId,
			fullName: row.fullName,
			position: row.position,
			daysWorked: row.daysWorked,
			accruedMinor: row.accruedMinor,
			adjustmentMinor: row.adjustmentMinor,
			adjustmentComment: row.adjustmentComment,
			payoutMinor: row.payoutMinor,
			paidAt: row.paidAt?.toISOString() ?? null,
			paidComment: row.paidComment
		};
	}
}
