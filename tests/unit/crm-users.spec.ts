import { and, eq, ne } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { verifyPassword } from '../../src/lib/server/auth/password';
import { PolicyService } from '../../src/lib/server/auth/policy';
import { SessionService } from '../../src/lib/server/auth/session.service';
import { CrmUserService } from '../../src/lib/server/crm-user/crm-user.service';
import {
	ConflictError,
	ForbiddenError,
	NotFoundError,
	ValidationError
} from '../../src/lib/server/core/errors';
import { auditLog, rateLimits, roles, sessions, users } from '../../src/lib/server/db/schema';
import { FakeMailDriver } from '../../src/lib/server/notifications/drivers/mail';
import type { ActorContext } from '../../src/lib/types/actor';
import { CRM_ROLES, type RoleCode } from '../../src/lib/types/roles';
import { createCrmUserSchema, crmUserFormFields } from '../../src/lib/validation/crm-user';
import { insertCounterparty, insertUser, migratedDatabase } from './helpers/db';

const db = migratedDatabase();
for (const code of CRM_ROLES) {
	db.insert(roles).values({ code, title: code }).onConflictDoNothing().run();
}
const ownerId = insertUser({ email: 'owner@ws.example', role: 'owner', counterpartyId: null });
const cpId = insertCounterparty('Ритуал-Сервис');
insertUser({ email: 'admin@rs.example', role: 'cp_admin', counterpartyId: cpId });
const mail = new FakeMailDriver();
let sequence = 0;

function actor(role: RoleCode = 'owner', userId = ownerId): ActorContext {
	const codes = [role];
	return {
		userId,
		roles: codes,
		scope: PolicyService.scopeOf(codes),
		counterpartyId: role.startsWith('cp_') ? cpId : null,
		canSeePrices: PolicyService.canSeePrices(codes),
		canSeeCost: PolicyService.canSeeCost(codes),
		requestId: 'crm-users-test'
	};
}

function service(ctx: ActorContext = actor()): CrmUserService {
	return new CrmUserService(ctx, mail);
}

function input(crmRoles: RoleCode[] = ['carpenter']) {
	sequence += 1;
	return createCrmUserSchema.parse({
		fullName: 'Павел Орлов',
		email: `new${sequence}@ws.example`,
		phone: '',
		roles: crmRoles
	});
}

beforeEach(() => {
	mail.reset();
	db.delete(rateLimits).run();
	db.delete(auditLog).run();
	db.delete(users)
		.where(and(ne(users.id, ownerId), eq(users.scope, 'crm')))
		.run();
});

describe('workshop accounts, owner only', () => {
	it('refuses every role but the owner, including a counterparty administrator', () => {
		for (const role of ['manager', 'carpenter', 'painter', 'driver', 'cp_admin'] as const) {
			expect(() => service(actor(role))).toThrow(ForbiddenError);
		}
	});

	it('creates a CRM account with several roles, a temporary password and an access mail', async () => {
		const created = await service().create(input(['painter', 'driver']));

		expect(created.user.roles).toEqual(['painter', 'driver']);
		expect(created.user.status).toBe('invited');
		const [row] = db.select().from(users).where(eq(users.id, created.user.id)).all();
		expect(row?.scope).toBe('crm');
		expect(row?.counterpartyId).toBeNull();
		expect(row?.mustChangePassword).toBe(true);
		expect(await verifyPassword(row?.passwordHash ?? '', created.temporaryPassword)).toBe(true);
		expect(created.mailSent).toBe(true);
		expect(mail.sent[0]?.text).toContain(created.temporaryPassword);
	});

	it('writes the creation to the audit journal without the address or the password', async () => {
		const created = await service().create(input(['manager']));
		const [entry] = db.select().from(auditLog).all();

		expect(entry).toMatchObject({
			action: 'crm_user.create',
			entity: 'users',
			entityId: created.user.id,
			actorId: ownerId,
			after: { roles: ['manager'] }
		});
		const journal = JSON.stringify(entry);
		expect(journal).not.toContain(created.user.email);
		expect(journal).not.toContain(created.temporaryPassword);
	});

	it('refuses an address that already has an account anywhere', async () => {
		const taken = { ...input(), email: 'admin@rs.example' };
		await expect(service().create(taken)).rejects.toThrow(ValidationError);
		expect(db.select().from(auditLog).all()).toHaveLength(0);
	});

	it('keeps the account when the access mail fails and says so', async () => {
		mail.failOnce();
		const created = await service().create(input());

		expect(created.mailSent).toBe(false);
		expect(
			service()
				.list({ page: 1, perPage: 50 })
				.rows.map((row) => row.id)
		).toContain(created.user.id);
	});

	it('reads repeated role checkboxes from the form', () => {
		const form = new FormData();
		form.append('fullName', 'Павел Орлов');
		form.append('email', 'Pavel@WS.example');
		form.append('phone', '');
		form.append('roles', 'carpenter');
		form.append('roles', 'painter');
		const parsed = createCrmUserSchema.parse(crmUserFormFields(form));
		expect(parsed.roles).toEqual(['carpenter', 'painter']);
		expect(parsed.email).toBe('pavel@ws.example');
		expect(createCrmUserSchema.safeParse({ ...parsed, roles: [] }).success).toBe(false);
		expect(createCrmUserSchema.safeParse({ ...parsed, roles: ['cp_admin'] }).success).toBe(false);
	});
});

describe('roles, access and passwords', () => {
	it('replaces the roles and journals both sets', async () => {
		const { user } = await service().create(input(['carpenter']));
		const changed = service().setRoles(user.id, ['painter', 'carpenter']);

		expect(changed.roles).toEqual(['carpenter', 'painter']);
		expect(service().list({ page: 1, perPage: 50, filters: { role: 'painter' } }).rows).toEqual([
			expect.objectContaining({ id: user.id, roles: ['carpenter', 'painter'] })
		]);
		const [entry] = db
			.select()
			.from(auditLog)
			.where(eq(auditLog.action, 'crm_user.roles_change'))
			.all();
		expect(entry?.before).toEqual({ roles: ['carpenter'] });
		expect(entry?.after).toEqual({ roles: ['painter', 'carpenter'] });
	});

	it('does not let the owner drop the own owner role, but keeps a second role addable', () => {
		expect(() => service().setRoles(ownerId, ['manager'])).toThrow(ConflictError);
		expect(service().setRoles(ownerId, ['owner', 'driver']).roles).toEqual(['owner', 'driver']);
		service().setRoles(ownerId, ['owner']);
	});

	it('disables another account and ends its sessions, never the own one', async () => {
		const { user } = await service().create(input());
		SessionService.create(user.id, { ip: null, userAgent: null });

		expect(service().setActive(user.id, false).status).toBe('disabled');
		expect(db.select().from(sessions).where(eq(sessions.userId, user.id)).all()).toHaveLength(0);
		expect(() => service().setActive(ownerId, false)).toThrow(ConflictError);
		expect(service().setActive(user.id, true).status).toBe('invited');
	});

	it('resets a forgotten password: new temporary one, lockout lifted, sessions gone', async () => {
		const { user } = await service().create(input());
		db.update(users)
			.set({
				failedAttempts: 5,
				lockedUntil: new Date(Date.now() + 60_000),
				mustChangePassword: false
			})
			.where(eq(users.id, user.id))
			.run();
		SessionService.create(user.id, { ip: null, userAgent: null });
		mail.reset();

		const reset = await service().resetPassword(user.id);
		const [row] = db.select().from(users).where(eq(users.id, user.id)).all();

		expect(await verifyPassword(row?.passwordHash ?? '', reset.temporaryPassword)).toBe(true);
		expect(row).toMatchObject({ mustChangePassword: true, failedAttempts: 0, lockedUntil: null });
		expect(db.select().from(sessions).where(eq(sessions.userId, user.id)).all()).toHaveLength(0);
		expect(mail.sent[0]?.subject).toContain('Новый пароль');
		await expect(service().resetPassword(ownerId)).rejects.toThrow(ConflictError);
	});

	it('never reaches a portal account or an unknown id', async () => {
		const [portal] = db.select().from(users).where(eq(users.scope, 'portal')).all();
		expect(() => service().setActive(portal?.id ?? 0, false)).toThrow(NotFoundError);
		expect(() => service().setRoles(999_999, ['driver'])).toThrow(NotFoundError);
		expect(
			service()
				.list({ page: 1, perPage: 50 })
				.rows.every((row) => row.email !== portal?.email)
		).toBe(true);
	});
});
