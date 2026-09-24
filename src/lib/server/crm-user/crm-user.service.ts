import { PolicyService } from '../auth/policy';
import { generateTemporaryPassword, hashPassword } from '../auth/password';
import { consumeRateLimit } from '../auth/rate-limit';
import { SessionService } from '../auth/session.service';
import { ConflictError, NotFoundError, ValidationError } from '../core/errors';
import { BaseService } from '../core/service';
import type { Tx } from '../db/client';
import { logger } from '../logger';
import type { MailDriver } from '../notifications/drivers/mail';
import { crmAccessMail } from '../notifications/templates/crm-access';
import { CrmUserRepository, type CrmUserRow } from './crm-user.repository';
import { CrmUserDtoMapper } from './dto';
import type { ActorContext } from '$lib/types/actor';
import type { CreatedCrmUserDto, CrmRole, CrmUserDto, CrmUserFilters } from '$lib/types/crm';
import type { ListQuery, Page } from '$lib/types/list';
import type { CreateCrmUserInput } from '$lib/validation/crm-user';

/**
 * Workshop accounts managed by the owner (C1). Only the owner holds `settings.manage`, and the owner
 * cannot disable, reset or demote the own account, so the workshop always keeps an active owner.
 */
export class CrmUserService extends BaseService {
	constructor(
		ctx: ActorContext,
		private readonly mail: MailDriver,
		private readonly repo: CrmUserRepository = new CrmUserRepository()
	) {
		super(ctx);
		this.assert(
			PolicyService.can(ctx, 'settings.manage') && ctx.scope === 'crm',
			'settings.manage'
		);
	}

	list(query: ListQuery<CrmUserFilters>): Page<CrmUserDto> {
		const { rows, total } = this.repo.list(query);
		return {
			rows: rows.map((row) => CrmUserDtoMapper.toUser(row, this.ctx)),
			total,
			page: query.page,
			perPage: query.perPage
		};
	}

	/**
	 * Creates the account with a temporary password and mails it. The mail goes through the driver
	 * directly, like in P2: the secret must not sit in the outbox (tech.md 7.1).
	 * @throws ValidationError for an address that already has an account.
	 */
	async create(input: CreateCrmUserInput): Promise<CreatedCrmUserDto> {
		consumeRateLimit('staff.create', String(this.ctx.userId));
		const temporaryPassword = generateTemporaryPassword();
		const passwordHash = await hashPassword(temporaryPassword);
		const row = this.audited({ action: 'crm_user.create', entity: 'users' }, (tx) => {
			if (this.repo.emailTaken(input.email, tx)) {
				throw new ValidationError('Этот адрес уже используется', { field: 'email' });
			}
			const { roles, ...account } = input;
			const id = this.repo.insert({ ...account, passwordHash }, tx);
			this.repo.setRoles(id, roles, tx);
			return { result: this.require(id, tx), entityId: id, after: { roles } };
		});
		const mailSent = await this.sendAccess(row.email, temporaryPassword, false);
		return { user: CrmUserDtoMapper.toUser(row, this.ctx), temporaryPassword, mailSent };
	}

	/** @throws ConflictError when the owner would drop the own owner role. */
	setRoles(id: number, roles: readonly CrmRole[]): CrmUserDto {
		const row = this.audited({ action: 'crm_user.roles_change', entity: 'users' }, (tx) => {
			const user = this.require(id, tx);
			if (user.id === this.ctx.userId && !roles.includes('owner')) {
				throw new ConflictError('Нельзя снять с себя роль руководителя');
			}
			// Sessions stay: SessionService.resolve reads the roles on every request.
			this.repo.setRoles(id, roles, tx);
			return {
				result: this.require(id, tx),
				entityId: id,
				before: { roles: user.roles },
				after: { roles }
			};
		});
		return CrmUserDtoMapper.toUser(row, this.ctx);
	}

	/** @throws ConflictError for the own account. */
	setActive(id: number, isActive: boolean): CrmUserDto {
		const action = isActive ? 'crm_user.enable' : 'crm_user.disable';
		const row = this.audited({ action, entity: 'users' }, (tx) => {
			const user = this.requireOther(id, tx, 'Нельзя отключить собственную учётную запись');
			this.repo.setActive(id, isActive, tx);
			// A disabled account loses the sessions it already holds, on every device.
			if (!isActive) SessionService.destroyAllFor(id, tx);
			return {
				result: { ...user, isActive },
				entityId: id,
				before: { isActive: user.isActive },
				after: { isActive }
			};
		});
		return CrmUserDtoMapper.toUser(row, this.ctx);
	}

	/** New temporary password for someone who forgot theirs. @throws ConflictError for the own account. */
	async resetPassword(id: number): Promise<CreatedCrmUserDto> {
		consumeRateLimit('staff.create', String(this.ctx.userId));
		const temporaryPassword = generateTemporaryPassword();
		const passwordHash = await hashPassword(temporaryPassword);
		const row = this.audited({ action: 'crm_user.password_reset', entity: 'users' }, (tx) => {
			const user = this.requireOther(id, tx, 'Свой пароль меняется на странице смены пароля');
			this.repo.setTemporaryPassword(id, passwordHash, tx);
			SessionService.destroyAllFor(id, tx);
			return { result: { ...user, mustChangePassword: true }, entityId: id };
		});
		const mailSent = await this.sendAccess(row.email, temporaryPassword, true);
		return { user: CrmUserDtoMapper.toUser(row, this.ctx), temporaryPassword, mailSent };
	}

	private require(id: number, tx: Tx): CrmUserRow {
		const user = this.repo.find(id, tx);
		if (!user) throw new NotFoundError('crm user');
		return user;
	}

	private requireOther(id: number, tx: Tx, message: string): CrmUserRow {
		const user = this.require(id, tx);
		if (user.id === this.ctx.userId) throw new ConflictError(message);
		return user;
	}

	private async sendAccess(
		to: string,
		temporaryPassword: string,
		isReset: boolean
	): Promise<boolean> {
		try {
			await this.mail.send(crmAccessMail({ to, temporaryPassword, isReset }));
			return true;
		} catch (err) {
			// The password is set either way; the owner sees it once and hands it over in person.
			logger.warn({ err: err instanceof Error ? err.message : 'unknown' }, 'access mail failed');
			return false;
		}
	}
}
