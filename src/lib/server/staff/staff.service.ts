import { PolicyService } from '../auth/policy';
import { generateTemporaryPassword, hashPassword } from '../auth/password';
import { consumeRateLimit } from '../auth/rate-limit';
import { SessionService } from '../auth/session.service';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../core/errors';
import { BaseService } from '../core/service';
import type { Tx } from '../db/client';
import { CounterpartyRepository } from '../counterparty/counterparty.repository';
import { logger } from '../logger';
import type { MailDriver } from '../notifications/drivers/mail';
import { staffAccessMail } from '../notifications/templates/staff-access';
import { StaffDtoMapper } from './dto';
import { StaffRepository, type StaffRow } from './staff.repository';
import type { ActorContext } from '$lib/types/actor';
import type {
	CreatedStaffDto,
	PortalRole,
	StaffFilters,
	StaffMemberDto,
	StaffPageDto
} from '$lib/types/counterparty';
import type { ListQuery } from '$lib/types/list';
import type { CreateStaffInput } from '$lib/validation/staff';

/** Portal accounts managed by the counterparty administrator (tech.md 14, P2). */
export class StaffService extends BaseService {
	constructor(
		ctx: ActorContext,
		private readonly mail: MailDriver,
		private readonly repo: StaffRepository = new StaffRepository(),
		private readonly counterparties: CounterpartyRepository = new CounterpartyRepository()
	) {
		super(ctx);
	}

	/** @throws ForbiddenError without `counterparty.staff.manage` or outside the portal. */
	list(query: ListQuery<StaffFilters>): StaffPageDto {
		const counterpartyId = this.requireManager();
		const { rows, total } = this.repo.list(this.ctx, query);
		return {
			rows: rows.map((row) => StaffDtoMapper.toMember(row, this.ctx)),
			total,
			page: query.page,
			perPage: query.perPage,
			activeCount: this.repo.countActive(counterpartyId),
			staffLimit: this.repo.staffLimit(counterpartyId)
		};
	}

	/**
	 * Creates the account with a temporary password and mails it. The mail goes through the driver
	 * directly, like a password reset: the secret must not sit in the outbox (tech.md 7.1).
	 * @throws ValidationError for a used address, ConflictError at the staff limit.
	 */
	async create(input: CreateStaffInput): Promise<CreatedStaffDto> {
		const counterpartyId = this.requireManager();
		consumeRateLimit('staff.create', String(this.ctx.userId));

		const temporaryPassword = generateTemporaryPassword();
		const passwordHash = await hashPassword(temporaryPassword);
		const member = this.audited({ action: 'staff.create', entity: 'users' }, (tx) => {
			if (this.repo.emailTaken(input.email, tx)) {
				throw new ValidationError('Этот адрес уже используется', { field: 'email' });
			}
			this.assertBelowLimit(counterpartyId, tx);
			const id = this.repo.insertMember({ ...input, counterpartyId, passwordHash }, tx);
			return { result: this.requireMember(id, tx), entityId: id, after: { role: input.role } };
		});

		const mailSent = await this.sendAccess(member.email, temporaryPassword);
		return { member: StaffDtoMapper.toMember(member, this.ctx), temporaryPassword, mailSent };
	}

	/** @throws ConflictError for the own account or at the staff limit, NotFoundError elsewhere. */
	setActive(id: number, isActive: boolean): StaffMemberDto {
		const counterpartyId = this.requireManager();
		const action = isActive ? 'staff.enable' : 'staff.disable';
		const row = this.audited({ action, entity: 'users' }, (tx) => {
			const member = this.requireOther(id, tx, 'Нельзя отключить собственную учётную запись');
			if (isActive && !member.isActive) this.assertBelowLimit(counterpartyId, tx);
			this.repo.setActive(id, isActive, tx);
			// A disabled account loses the sessions it already holds, on every device.
			if (!isActive) SessionService.destroyAllFor(id, tx);
			return {
				result: { ...member, isActive },
				entityId: id,
				before: { isActive: member.isActive },
				after: { isActive }
			};
		});
		return StaffDtoMapper.toMember(row, this.ctx);
	}

	/** @throws ConflictError for the own account, NotFoundError for another counterparty. */
	setRole(id: number, role: PortalRole): StaffMemberDto {
		this.requireManager();
		const row = this.audited({ action: 'staff.role_change', entity: 'users' }, (tx) => {
			const member = this.requireOther(id, tx, 'Нельзя сменить собственную роль');
			this.repo.setRole(id, role, tx);
			return {
				result: { ...member, role },
				entityId: id,
				before: { role: member.role },
				after: { role }
			};
		});
		return StaffDtoMapper.toMember(row, this.ctx);
	}

	private requireManager(): number {
		this.assert(
			PolicyService.can(this.ctx, 'counterparty.staff.manage'),
			'counterparty.staff.manage'
		);
		// The workshop manages counterparty accounts from the CRM (C3), not through this service.
		if (this.ctx.scope !== 'portal' || this.ctx.counterpartyId === null) {
			throw new ForbiddenError('counterparty.staff.manage');
		}
		return this.ctx.counterpartyId;
	}

	private requireMember(id: number, tx: Tx): StaffRow {
		const member = this.repo.findMember(this.ctx, id, tx);
		if (!member) throw new NotFoundError('staff member');
		return member;
	}

	/** Blocks self-service lockouts: an administrator cannot disable or demote the own account. */
	private requireOther(id: number, tx: Tx, message: string): StaffRow {
		const member = this.requireMember(id, tx);
		if (member.id === this.ctx.userId) throw new ConflictError(message);
		return member;
	}

	private assertBelowLimit(counterpartyId: number, tx: Tx): void {
		const limit = this.repo.staffLimit(counterpartyId, tx);
		if (this.repo.countActive(counterpartyId, tx) >= limit) {
			throw new ConflictError(`Достигнут лимит сотрудников: ${limit}`);
		}
	}

	private async sendAccess(to: string, temporaryPassword: string): Promise<boolean> {
		const counterpartyName = this.counterparties.findOwn(this.ctx)?.name ?? '';
		try {
			await this.mail.send(staffAccessMail({ to, counterpartyName, temporaryPassword }));
			return true;
		} catch (err) {
			// The account exists either way; the administrator sees the password once and hands it over.
			logger.warn({ err: err instanceof Error ? err.message : 'unknown' }, 'access mail failed');
			return false;
		}
	}
}
