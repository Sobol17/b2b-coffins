import { AuthRepository } from '../auth/auth.repository';
import { generateTemporaryPassword, hashPassword } from '../auth/password';
import { consumeRateLimit } from '../auth/rate-limit';
import { SessionService } from '../auth/session.service';
import { ConflictError, NotFoundError, ValidationError } from '../core/errors';
import type { Tx } from '../db/client';
import { StaffDtoMapper } from '../staff/dto';
import { StaffRepository, type StaffRow } from '../staff/staff.repository';
import { CounterpartyBaseService } from './counterparty-base.service';
import { CrmCounterpartyRepository } from './crm-counterparty.repository';
import type { ActorContext } from '$lib/types/actor';
import type { CreatedStaffDto, StaffMemberDto } from '$lib/types/counterparty';
import type { IssueAdminInput } from '$lib/validation/crm-counterparty';

/** Portal administrators and temporary passwords issued by the workshop (C3). */
export class CounterpartyAccessService extends CounterpartyBaseService {
	constructor(
		ctx: ActorContext,
		counterparties: CrmCounterpartyRepository = new CrmCounterpartyRepository(),
		private readonly staff: StaffRepository = new StaffRepository()
	) {
		super(ctx, counterparties);
	}

	/** @throws ValidationError for a used login, ConflictError at the staff limit. */
	async issueAdmin(counterpartyId: number, input: IssueAdminInput): Promise<CreatedStaffDto> {
		const { passwordHash, temporaryPassword } = await this.newPassword();
		const admin = this.audited({ action: 'counterparty.admin_issue', entity: 'users' }, (tx) => {
			const counterparty = this.requireCounterparty(counterpartyId, tx);
			this.assertLoginFree(input.email, input.phone, tx);
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
		return { member: StaffDtoMapper.toMember(admin, this.ctx), temporaryPassword, mailSent: false };
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
		return {
			member: StaffDtoMapper.toMember(member, this.ctx),
			temporaryPassword,
			mailSent: false
		};
	}

	/** Spends the `staff.create` limit before hashing: argon2 is the expensive part of the call. */
	private async newPassword(): Promise<{ passwordHash: string; temporaryPassword: string }> {
		consumeRateLimit('staff.create', String(this.ctx.userId));
		const temporaryPassword = generateTemporaryPassword();
		return { passwordHash: await hashPassword(temporaryPassword), temporaryPassword };
	}

	private assertLoginFree(email: string | null, phone: string, tx: Tx): void {
		if (new AuthRepository().phoneTaken(phone, tx))
			throw new ValidationError('Этот телефон уже используется', { field: 'phone' });
		if (email && this.staff.emailTaken(email, tx)) {
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
}
