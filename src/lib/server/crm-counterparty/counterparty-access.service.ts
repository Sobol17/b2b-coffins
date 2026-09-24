import { generateTemporaryPassword, hashPassword } from '../auth/password';
import { consumeRateLimit } from '../auth/rate-limit';
import { SessionService } from '../auth/session.service';
import { ConflictError, NotFoundError, ValidationError } from '../core/errors';
import type { Tx } from '../db/client';
import { logger } from '../logger';
import type { MailDriver } from '../notifications/drivers/mail';
import { staffAccessMail } from '../notifications/templates/staff-access';
import { OrgService } from '../settings/org.service';
import { StaffDtoMapper } from '../staff/dto';
import { StaffRepository, type StaffRow } from '../staff/staff.repository';
import { CounterpartyBaseService } from './counterparty-base.service';
import { CrmCounterpartyRepository } from './crm-counterparty.repository';
import type { ActorContext } from '$lib/types/actor';
import type { CreatedStaffDto, StaffMemberDto } from '$lib/types/counterparty';
import type { CreatedCounterpartyDto } from '$lib/types/crm-counterparty';
import type { CreateCounterpartyInput, IssueAdminInput } from '$lib/validation/crm-counterparty';

/**
 * Portal access the workshop hands out (C3): a new counterparty with its first administrator,
 * another administrator, and a fresh temporary password. The password mail goes through the driver
 * directly, as in P2: the secret must not sit in the outbox (tech.md 7.1).
 */
export class CounterpartyAccessService extends CounterpartyBaseService {
	constructor(
		ctx: ActorContext,
		private readonly mail: MailDriver,
		counterparties: CrmCounterpartyRepository = new CrmCounterpartyRepository(),
		private readonly staff: StaffRepository = new StaffRepository()
	) {
		super(ctx, counterparties);
	}

	/**
	 * One transaction for both rows: a counterparty without an administrator cannot sign in and
	 * cannot be fixed from the portal (the same rule as `pnpm admin counterparty:create`).
	 * @throws ValidationError for a used login or an unknown manager or price list.
	 */
	async create(input: CreateCounterpartyInput): Promise<CreatedCounterpartyDto> {
		const { passwordHash, temporaryPassword } = await this.newPassword();
		const created = this.audited(
			{ action: 'counterparty.create', entity: 'counterparties' },
			(tx) => {
				this.validateTerms(input.terms, tx);
				this.assertLoginFree(input.admin.email, tx);
				const staffLimit = OrgService.staffLimitDefault();
				const id = this.counterparties.insert(input.requisites, input.terms, staffLimit, tx);
				const adminId = this.staff.insertMember(
					{ ...input.admin, role: 'cp_admin', counterpartyId: id, passwordHash },
					tx
				);
				return {
					result: { id, admin: this.requireMember(id, adminId, tx) },
					entityId: id,
					after: { ...input.terms, staffLimit, adminId }
				};
			}
		);
		const mailSent = await this.sendAccess(created.admin.email, created.id, temporaryPassword);
		return {
			counterpartyId: created.id,
			access: {
				member: StaffDtoMapper.toMember(created.admin, this.ctx),
				temporaryPassword,
				mailSent
			}
		};
	}

	/** @throws ValidationError for a used login, ConflictError at the staff limit. */
	async issueAdmin(counterpartyId: number, input: IssueAdminInput): Promise<CreatedStaffDto> {
		const { passwordHash, temporaryPassword } = await this.newPassword();
		const admin = this.audited({ action: 'counterparty.admin_issue', entity: 'users' }, (tx) => {
			const counterparty = this.requireCounterparty(counterpartyId, tx);
			this.assertLoginFree(input.email, tx);
			if (this.staff.countActive(counterpartyId, tx) >= counterparty.staffLimit) {
				throw new ConflictError('Достигнут лимит сотрудников контрагента');
			}
			const id = this.staff.insertMember(
				{ ...input, role: 'cp_admin', counterpartyId, passwordHash },
				tx
			);
			return {
				result: this.requireMember(counterpartyId, id, tx),
				entityId: id,
				after: { counterpartyId, role: 'cp_admin' }
			};
		});
		const mailSent = await this.sendAccess(admin.email, counterpartyId, temporaryPassword);
		return { member: StaffDtoMapper.toMember(admin, this.ctx), temporaryPassword, mailSent };
	}

	/** @throws ConflictError for a disabled account or one that already administers. */
	promoteAdmin(counterpartyId: number, userId: number): StaffMemberDto {
		const member = this.audited({ action: 'counterparty.admin_promote', entity: 'users' }, (tx) => {
			this.requireCounterparty(counterpartyId, tx);
			const old = this.requireActive(counterpartyId, userId, tx);
			if (old.role === 'cp_admin') throw new ConflictError('Сотрудник уже администратор');
			this.staff.setRole(userId, 'cp_admin', tx);
			return {
				result: this.requireMember(counterpartyId, userId, tx),
				entityId: userId,
				before: { role: old.role },
				after: { role: 'cp_admin' }
			};
		});
		return StaffDtoMapper.toMember(member, this.ctx);
	}

	/** New temporary password for someone who lost access; every session of the account ends. */
	async resendAccess(counterpartyId: number, userId: number): Promise<CreatedStaffDto> {
		const { passwordHash, temporaryPassword } = await this.newPassword();
		const member = this.audited({ action: 'counterparty.access_resend', entity: 'users' }, (tx) => {
			this.requireCounterparty(counterpartyId, tx);
			const row = this.requireActive(counterpartyId, userId, tx);
			this.staff.setTemporaryPassword(userId, passwordHash, tx);
			SessionService.destroyAllFor(userId, tx);
			return { result: { ...row, mustChangePassword: true }, entityId: userId };
		});
		const mailSent = await this.sendAccess(member.email, counterpartyId, temporaryPassword);
		return { member: StaffDtoMapper.toMember(member, this.ctx), temporaryPassword, mailSent };
	}

	/** Spends the `staff.create` limit before hashing: argon2 is the expensive part of the call. */
	private async newPassword(): Promise<{ passwordHash: string; temporaryPassword: string }> {
		consumeRateLimit('staff.create', String(this.ctx.userId));
		const temporaryPassword = generateTemporaryPassword();
		return { passwordHash: await hashPassword(temporaryPassword), temporaryPassword };
	}

	private assertLoginFree(email: string, tx: Tx): void {
		if (this.staff.emailTaken(email, tx)) {
			throw new ValidationError('Этот адрес уже используется', { field: 'email' });
		}
	}

	private requireMember(counterpartyId: number, userId: number, tx: Tx): StaffRow {
		const row = this.staff.findOf(counterpartyId, userId, tx);
		if (!row) throw new NotFoundError('counterparty user');
		return row;
	}

	private requireActive(counterpartyId: number, userId: number, tx: Tx): StaffRow {
		const row = this.requireMember(counterpartyId, userId, tx);
		if (!row.isActive)
			throw new ConflictError('Учётная запись отключена администратором контрагента');
		return row;
	}

	private async sendAccess(
		to: string,
		counterpartyId: number,
		temporaryPassword: string
	): Promise<boolean> {
		const counterpartyName = this.requireCounterparty(counterpartyId).name;
		try {
			await this.mail.send(staffAccessMail({ to, counterpartyName, temporaryPassword }));
			return true;
		} catch (err) {
			// The password is set either way; the manager sees it once and hands it over in person.
			logger.warn({ err: err instanceof Error ? err.message : 'unknown' }, 'access mail failed');
			return false;
		}
	}
}
