import { staffStatus } from '../staff/dto';
import type { CrmUserRow } from './crm-user.repository';
import type { ActorContext } from '$lib/types/actor';
import type { CrmUserDto } from '$lib/types/crm';

export class CrmUserDtoMapper {
	static toUser(row: CrmUserRow, ctx: ActorContext): CrmUserDto {
		return {
			id: row.id,
			fullName: row.fullName,
			email: row.email,
			phone: row.phone,
			roles: row.roles,
			status: staffStatus(row),
			lastLoginAt: row.lastLoginAt?.toISOString() ?? null,
			isSelf: row.id === ctx.userId
		};
	}
}
