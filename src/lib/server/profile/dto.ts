import type { ProfileRow } from './profile.repository';

export interface ProfileDto {
	readonly fullName: string;
	readonly phone: string | null;
	readonly email: string;
}

export class ProfileDtoMapper {
	/** The row id stays on the server: the page addresses the profile through the session. */
	static toDto(row: ProfileRow): ProfileDto {
		return { fullName: row.fullName, phone: row.phone, email: row.email };
	}
}
