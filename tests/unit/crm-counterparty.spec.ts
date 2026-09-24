import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { verifyPassword } from '../../src/lib/server/auth/password';
import { SessionService } from '../../src/lib/server/auth/session.service';
import {
	ConflictError,
	ForbiddenError,
	NotFoundError,
	ValidationError
} from '../../src/lib/server/core/errors';
import { CounterpartyAccessService } from '../../src/lib/server/crm-counterparty/counterparty-access.service';
import { CounterpartyDetailService } from '../../src/lib/server/crm-counterparty/counterparty-detail.service';
import { CounterpartyLedgerService } from '../../src/lib/server/crm-counterparty/counterparty-ledger.service';
import { CrmCounterpartyService } from '../../src/lib/server/crm-counterparty/crm-counterparty.service';
import {
	auditLog,
	counterparties,
	rateLimits,
	sessions,
	settings,
	users
} from '../../src/lib/server/db/schema';
import { FakeMailDriver } from '../../src/lib/server/notifications/drivers/mail';
import type { RoleCode } from '../../src/lib/types/roles';
import { actorOf, counterpartyDatabase, newCounterparty } from './helpers/crm-counterparty';
import { insertUser } from './helpers/db';

const db = counterpartyDatabase();
const managerId = insertUser({
	email: 'manager@ws.example',
	role: 'manager',
	counterpartyId: null
});
const carpenterId = insertUser({
	email: 'carp@ws.example',
	role: 'carpenter',
	counterpartyId: null
});
db.insert(settings).values({ key: 'counterparty.staff_limit_default', value: 2 }).run();
const mail = new FakeMailDriver();

const manager = actorOf('manager', managerId);
const access = () => new CounterpartyAccessService(manager, mail);

beforeEach(() => {
	mail.reset();
	db.delete(rateLimits).run();
	db.delete(auditLog).run();
});

describe('who may manage counterparties', () => {
	it('lets only the owner and the manager in, and only inside the CRM', () => {
		const refused: RoleCode[] = ['carpenter', 'painter', 'driver', 'cp_admin', 'cp_employee'];
		for (const role of refused) {
			const ctx = actorOf(role, carpenterId, role.startsWith('cp_') ? 1 : null);
			expect(() => new CrmCounterpartyService(ctx)).toThrow(ForbiddenError);
			expect(() => new CounterpartyAccessService(ctx, mail)).toThrow(ForbiddenError);
			expect(() => new CounterpartyDetailService(ctx)).toThrow(ForbiddenError);
			expect(() => new CounterpartyLedgerService(ctx)).toThrow(ForbiddenError);
		}
		expect(() => new CrmCounterpartyService(actorOf('owner', managerId))).not.toThrow();
	});
});

describe('a manager creates a counterparty with its administrator (C3 DoD)', () => {
	it('writes both rows, mails the access and shows the password once', async () => {
		const input = newCounterparty({ managerId: String(managerId) });
		const created = await access().create(input);

		const [row] = db
			.select()
			.from(counterparties)
			.where(eq(counterparties.id, created.counterpartyId))
			.all();
		expect(row).toMatchObject({
			name: input.requisites.name,
			inn: '7701234567',
			discountPercent: 3,
			settlementScheme: 'weekly',
			managerId,
			// The seats come from counterparty.staff_limit_default, not from the column default.
			staffLimit: 2
		});
		const [admin] = db.select().from(users).where(eq(users.id, created.access.member.id)).all();
		expect(admin).toMatchObject({
			scope: 'portal',
			counterpartyId: created.counterpartyId,
			mustChangePassword: true
		});
		expect(created.access.member).toMatchObject({
			role: 'cp_admin',
			status: 'invited',
			isSelf: false
		});
		expect(await verifyPassword(admin?.passwordHash ?? '', created.access.temporaryPassword)).toBe(
			true
		);
		expect(created.access.mailSent).toBe(true);
		expect(mail.sent[0]).toMatchObject({ to: input.admin.email });
		expect(mail.sent[0]?.text).toContain(created.access.temporaryPassword);
		expect(mail.sent[0]?.text).toContain(input.requisites.name);
	});

	it('journals the creation without the login or the password', async () => {
		const created = await access().create(newCounterparty());
		const [entry] = db.select().from(auditLog).all();

		expect(entry).toMatchObject({
			action: 'counterparty.create',
			entity: 'counterparties',
			entityId: created.counterpartyId,
			actorId: managerId
		});
		const journal = JSON.stringify(entry);
		expect(journal).not.toContain(created.access.member.email);
		expect(journal).not.toContain(created.access.temporaryPassword);
	});

	it('leaves nothing behind when the administrator login is taken', async () => {
		const before = db.select().from(counterparties).all().length;
		await expect(
			access().create(newCounterparty({ adminEmail: 'manager@ws.example' }))
		).rejects.toThrow(ValidationError);
		expect(db.select().from(counterparties).all()).toHaveLength(before);
		expect(db.select().from(auditLog).all()).toHaveLength(0);
	});

	it('refuses a responsible manager who is not a manager of the workshop', async () => {
		await expect(
			access().create(newCounterparty({ managerId: String(carpenterId) }))
		).rejects.toThrow(ValidationError);
		await expect(access().create(newCounterparty({ priceListId: '999' }))).rejects.toThrow(
			ValidationError
		);
	});

	it('keeps the counterparty when the access mail fails and says so', async () => {
		mail.failOnce();
		const created = await access().create(newCounterparty());
		expect(created.access.mailSent).toBe(false);
		expect(new CrmCounterpartyService(manager).card(created.counterpartyId).users).toHaveLength(1);
	});
});

describe('administrators and access of an existing counterparty', () => {
	it('issues another administrator within the staff limit only', async () => {
		const { counterpartyId } = await access().create(newCounterparty());
		const issued = await access().issueAdmin(counterpartyId, {
			fullName: 'Иван Петров',
			email: 'ivan.issue@agency.example',
			phone: null
		});

		expect(issued.member.role).toBe('cp_admin');
		expect(mail.sent.at(-1)?.to).toBe('ivan.issue@agency.example');
		await expect(
			access().issueAdmin(counterpartyId, {
				fullName: 'Третий Лишний',
				email: 'third@agency.example',
				phone: null
			})
		).rejects.toThrow(ConflictError);
	});

	it('promotes an active employee and journals the old role', async () => {
		const { counterpartyId } = await access().create(newCounterparty());
		const employeeId = insertUser({
			email: 'promote@agency.example',
			role: 'cp_employee',
			counterpartyId
		});

		expect(access().promoteAdmin(counterpartyId, employeeId).role).toBe('cp_admin');
		const [entry] = db
			.select()
			.from(auditLog)
			.where(eq(auditLog.action, 'counterparty.admin_promote'))
			.all();
		expect(entry).toMatchObject({ before: { role: 'cp_employee' }, after: { role: 'cp_admin' } });
		expect(() => access().promoteAdmin(counterpartyId, employeeId)).toThrow(ConflictError);
	});

	it('resends access: new temporary password, sessions ended, a disabled account refused', async () => {
		const { counterpartyId, access: first } = await access().create(newCounterparty());
		const adminId = first.member.id;
		SessionService.create(adminId, { ip: null, userAgent: null });

		const again = await access().resendAccess(counterpartyId, adminId);
		const [row] = db.select().from(users).where(eq(users.id, adminId)).all();
		expect(await verifyPassword(row?.passwordHash ?? '', again.temporaryPassword)).toBe(true);
		expect(db.select().from(sessions).where(eq(sessions.userId, adminId)).all()).toHaveLength(0);

		db.update(users).set({ isActive: false }).where(eq(users.id, adminId)).run();
		await expect(access().resendAccess(counterpartyId, adminId)).rejects.toThrow(ConflictError);
	});

	it('never reaches a person of another counterparty through this one', async () => {
		const own = await access().create(newCounterparty());
		const other = await access().create(newCounterparty());

		expect(() => access().promoteAdmin(own.counterpartyId, other.access.member.id)).toThrow(
			NotFoundError
		);
		await expect(access().resendAccess(own.counterpartyId, other.access.member.id)).rejects.toThrow(
			NotFoundError
		);
	});
});
