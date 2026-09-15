import { PolicyService } from '../auth/policy';
import { NotFoundError } from '../core/errors';
import { BaseService } from '../core/service';
import { ProfileDtoMapper, type ProfileDto } from './dto';
import { ProfileRepository, type ProfileRow } from './profile.repository';
import type { ActorContext } from '$lib/types/actor';
import type { UpdateProfileInput } from '$lib/validation/profile';

/** Reference vertical of tech.md 14 K5: policy, repository, audit and DTO in one small service. */
export class ProfileService extends BaseService {
	constructor(
		ctx: ActorContext,
		private readonly repo: ProfileRepository = new ProfileRepository()
	) {
		super(ctx);
	}

	/** @throws ForbiddenError outside the portal, NotFoundError when the row is filtered out. */
	get(): ProfileDto {
		this.assert(PolicyService.can(this.ctx, 'portal.access'), 'portal.access');
		return ProfileDtoMapper.toDto(this.requireOwn());
	}

	/** @throws ForbiddenError outside the portal, NotFoundError when the row is filtered out. */
	update(input: UpdateProfileInput): ProfileDto {
		this.assert(PolicyService.can(this.ctx, 'portal.access'), 'portal.access');
		return this.audited({ action: 'profile.update', entity: 'users' }, (tx) => {
			const before = this.requireOwn(tx);
			this.repo.updateContact(before.id, input, tx);
			return {
				result: ProfileDtoMapper.toDto({ ...before, ...input }),
				entityId: before.id,
				after: { changed: changedFields(before, input) }
			};
		});
	}

	private requireOwn(tx?: Parameters<ProfileRepository['findOwn']>[1]): ProfileRow {
		const row = this.repo.findOwn(this.ctx, tx);
		if (!row) throw new NotFoundError('profile');
		return row;
	}
}

function changedFields(before: ProfileRow, input: UpdateProfileInput): string[] {
	return (Object.keys(input) as (keyof UpdateProfileInput)[]).filter(
		(key) => before[key] !== input[key]
	);
}
