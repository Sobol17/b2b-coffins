import { asPortalRole } from '../counterparty/dto';
import type { StaffRow } from './staff.repository';
import type { ActorContext } from '$lib/types/actor';
import type { StaffMemberDto, StaffStatus } from '$lib/types/counterparty';

/**
 * An account that still holds its temporary password and never signed in is "invited".
 * Keep in step with `statusWhere` in staff.repository.ts, which filters by the same rule.
 */
export function staffStatus(
	row: Pick<StaffRow, 'isActive' | 'mustChangePassword' | 'lastLoginAt'>
): StaffStatus {
	if (!row.isActive) return 'disabled';
	return row.mustChangePassword && row.lastLoginAt === null ? 'invited' : 'active';
}

export class StaffDtoMapper {
	static toMember(row: StaffRow, ctx: ActorContext): StaffMemberDto {
		return {
			id: row.id,
			fullName: row.fullName,
			email: row.email,
			phone: row.phone,
			role: asPortalRole(row.role),
			status: staffStatus(row),
			lastLoginAt: row.lastLoginAt?.toISOString() ?? null,
			isSelf: row.id === ctx.userId
		};
	}
}
