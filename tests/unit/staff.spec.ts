import { and, eq, ne } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { verifyPassword } from '../../src/lib/server/auth/password';
import { PolicyService } from '../../src/lib/server/auth/policy';
import {
	ConflictError,
	ForbiddenError,
	NotFoundError,
	RateLimitError,
	ValidationError
} from '../../src/lib/server/core/errors';
import {
	auditLog,
	counterparties,
	rateLimits,
	sessions,
	userRoles,
	users
} from '../../src/lib/server/db/schema';
import { FakeMailDriver } from '../../src/lib/server/notifications/drivers/mail';
import { StaffService } from '../../src/lib/server/staff/staff.service';
import type { ActorContext } from '../../src/lib/types/actor';
import type { RoleCode } from '../../src/lib/types/roles';
import { passwordSchema } from '../../src/lib/validation/auth';
import { createStaffSchema, staffFiltersSchema } from '../../src/lib/validation/staff';
import { insertCounterparty, insertUser, migratedDatabase } from './helpers/db';

const db = migratedDatabase();
const [own] = db
	.insert(counterparties)
	.values({ name: 'Ритуал-Сервис', staffLimit: 3 })
	.returning()
	.all();
const cpId = own?.id ?? 0;
const otherCp = insertCounterparty('Чужое агентство');
const adminId = insertUser({
	email: 'admin@rs.example',
	role: 'cp_admin',
	counterpartyId: cpId,
	fullName: 'Пётр Ильин'
});
const outsiderId = insertUser({
	email: 'outsider@other.example',
	role: 'cp_employee',
	counterpartyId: otherCp
});
const mail = new FakeMailDriver();
let sequence = 0;

function actor(role: RoleCode = 'cp_admin', userId = adminId): ActorContext {
	const roles = [role];
	return {
		userId,
		roles,
		scope: PolicyService.scopeOf(roles),
		counterpartyId: cpId,
		canSeePrices: PolicyService.canSeePrices(roles),
		canSeeCost: false,
		requestId: 'staff-test'
	};
}

function service(ctx: ActorContext = actor()): StaffService {
	return new StaffService(ctx, mail);
}

function input(role: 'cp_admin' | 'cp_employee' = 'cp_employee', fullName = 'Анна Белова') {
	sequence += 1;
	return { fullName, email: `new${sequence}@rs.example`, phone: null, role };
}

beforeEach(() => {
	mail.reset();
	db.delete(rateLimits).run();
	db.delete(auditLog).run();
	db.delete(users)
		.where(and(eq(users.counterpartyId, cpId), ne(users.id, adminId)))
		.run();
});

describe('creating a portal account', () => {
	it('creates an invited employee whose temporary password opens the account', async () => {
		const created = await service().create(input());

		expect(created.member).toMatchObject({ status: 'invited', role: 'cp_employee', isSelf: false });
		expect(passwordSchema.safeParse(created.temporaryPassword).success).toBe(true);
		const [row] = db.select().from(users).where(eq(users.id, created.member.id)).all();
		expect(row).toMatchObject({ mustChangePassword: true, counterpartyId: cpId, scope: 'portal' });
		expect(await verifyPassword(row?.passwordHash ?? '', created.temporaryPassword)).toBe(true);
	});

	it('mails the login address and the temporary password to the new account', async () => {
		const created = await service().create(input());

		expect(created.mailSent).toBe(true);
		expect(mail.sent).toHaveLength(1);
		expect(mail.sent[0]?.to).toBe(created.member.email);
		expect(mail.sent[0]?.text).toContain(created.temporaryPassword);
		expect(mail.sent[0]?.text).toContain('/login');
	});

	it('journals the creation without the address and without the password', async () => {
		const created = await service().create(input());

		const entries = db.select().from(auditLog).where(eq(auditLog.action, 'staff.create')).all();
		expect(entries).toHaveLength(1);
		expect(entries[0]).toMatchObject({
			actorId: adminId,
			entityId: created.member.id,
			after: { role: 'cp_employee' }
		});
		const journal = JSON.stringify(entries);
		expect(journal).not.toContain(created.member.email);
		expect(journal).not.toContain(created.temporaryPassword);
	});

	it('refuses an address that already belongs to any account and mails nothing', async () => {
		await expect(service().create({ ...input(), email: 'outsider@other.example' })).rejects.toThrow(
			ValidationError
		);
		expect(mail.sent).toHaveLength(0);
	});

	it('stops at the staff limit and counts only active accounts', async () => {
		await service().create(input());
		const second = await service().create(input());

		await expect(service().create(input())).rejects.toThrow(ConflictError);

		service().setActive(second.member.id, false);
		await expect(service().create(input())).resolves.toMatchObject({
			member: { status: 'invited' }
		});
	});

	it('keeps the account when the mail driver fails, so the password shown once still works', async () => {
		mail.failOnce();

		const created = await service().create(input());

		expect(created.mailSent).toBe(false);
		expect(db.select().from(users).where(eq(users.id, created.member.id)).all()).toHaveLength(1);
	});

	it('rate limits account creation per administrator', async () => {
		db.insert(rateLimits)
			.values({ key: `staff.create:${adminId}`, hits: 20, windowStart: new Date() })
			.run();

		await expect(service().create(input())).rejects.toThrow(RateLimitError);
	});
});

describe('managing accounts', () => {
	it('lists own accounts only and hides another counterparty entirely', async () => {
		await service().create(input());

		const page = service().list({ page: 1, perPage: 20 });

		expect(page.rows.map((row) => row.email)).not.toContain('outsider@other.example');
		expect(page).toMatchObject({ total: 2, activeCount: 2, staffLimit: 3 });
		expect(() => service().setActive(outsiderId, false)).toThrow(NotFoundError);
		expect(() => service().setRole(outsiderId, 'cp_admin')).toThrow(NotFoundError);
	});

	it('filters by status and role and finds a Cyrillic name', async () => {
		const disabled = await service().create(input('cp_employee', 'Роман Никитин'));
		service().setActive(disabled.member.id, false);
		await service().create(input());

		expect(
			service()
				.list({ page: 1, perPage: 20, filters: { status: 'disabled' } })
				.rows.map((r) => r.fullName)
		).toEqual(['Роман Никитин']);
		expect(
			service()
				.list({ page: 1, perPage: 20, filters: { role: 'cp_admin' } })
				.rows.map((r) => r.id)
		).toEqual([adminId]);
		expect(
			service()
				.list({ page: 1, perPage: 20, search: 'Пётр' })
				.rows.map((r) => r.id)
		).toEqual([adminId]);
	});

	it('finds a name or an address in any case and reads a typed wildcard as a plain character', async () => {
		const created = await service().create(input('cp_employee', 'Светлана Орлова'));
		const found = (search: string) =>
			service()
				.list({ page: 1, perPage: 20, search })
				.rows.map((r) => r.id);

		expect(found('светлана')).toEqual([created.member.id]);
		expect(found('ОРЛОВА')).toEqual([created.member.id]);
		expect(found('%')).toEqual([]);
	});

	it('disables an account and ends every session it holds', async () => {
		const created = await service().create(input());
		db.insert(sessions)
			.values({
				id: 'live-session',
				userId: created.member.id,
				expiresAt: new Date(Date.now() + 3_600_000)
			})
			.run();

		const member = service().setActive(created.member.id, false);

		expect(member.status).toBe('disabled');
		expect(
			db.select().from(sessions).where(eq(sessions.userId, created.member.id)).all()
		).toHaveLength(0);
	});

	it('does not bring a disabled account back over the limit', async () => {
		const first = await service().create(input());
		service().setActive(first.member.id, false);
		await service().create(input());
		await service().create(input());

		expect(() => service().setActive(first.member.id, true)).toThrow(ConflictError);
	});

	it('replaces the role of another member', async () => {
		const created = await service().create(input());

		expect(service().setRole(created.member.id, 'cp_admin').role).toBe('cp_admin');
		expect(
			db.select().from(userRoles).where(eq(userRoles.userId, created.member.id)).all()
		).toHaveLength(1);
	});

	it('does not let the administrator disable or demote the own account', () => {
		expect(() => service().setActive(adminId, false)).toThrow(ConflictError);
		expect(() => service().setRole(adminId, 'cp_employee')).toThrow(ConflictError);
	});

	it('refuses an employee of the same counterparty', async () => {
		const employee = actor('cp_employee', outsiderId);

		expect(() => service(employee).list({ page: 1, perPage: 20 })).toThrow(ForbiddenError);
		await expect(service(employee).create(input())).rejects.toThrow(ForbiddenError);
	});
});

describe('staff form contract', () => {
	it('lower-cases and trims the address and turns an empty phone into null', () => {
		expect(
			createStaffSchema.parse({
				fullName: ' Анна ',
				email: ' Anna@RS.example ',
				phone: '',
				role: 'cp_employee'
			})
		).toEqual({
			fullName: 'Анна',
			email: 'anna@rs.example',
			phone: null,
			role: 'cp_employee'
		});
	});

	it('refuses a workshop role in a portal form', () => {
		expect(
			createStaffSchema.safeParse({
				fullName: 'Анна',
				email: 'a@rs.example',
				phone: '',
				role: 'owner'
			}).success
		).toBe(false);
	});

	it('drops tampered filter values instead of failing the page', () => {
		expect(staffFiltersSchema.parse({ role: 'owner', status: 'deleted' })).toEqual({});
		expect(staffFiltersSchema.parse({ role: 'cp_admin', status: 'invited' })).toEqual({
			role: 'cp_admin',
			status: 'invited'
		});
	});
});
