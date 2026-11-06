import { and, eq, ne } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { verifyPassword } from '../../src/lib/server/auth/password';
import { PolicyService } from '../../src/lib/server/auth/policy';
import { SessionService } from '../../src/lib/server/auth/session.service';
import { CrmUserService } from '../../src/lib/server/crm-user/crm-user.service';
import { CrmUserRepository } from '../../src/lib/server/crm-user/crm-user.repository';
import {
	ConflictError,
	ForbiddenError,
	NotFoundError,
	ValidationError
} from '../../src/lib/server/core/errors';
import {
	auditLog,
	payrollLines,
	payrollPeriods,
	rateLimits,
	roles,
	sessions,
	staff,
	users,
	workDays,
	workEntries,
	workEntryStaff,
	workTypes
} from '../../src/lib/server/db/schema';
import { FakeMailDriver } from '../../src/lib/server/notifications/drivers/mail';
import type { ActorContext } from '../../src/lib/types/actor';
import { CRM_ROLES, type RoleCode } from '../../src/lib/types/roles';
import {
	createCrmUserSchema,
	crmUserFormFields,
	updateCrmUserSchema
} from '../../src/lib/validation/crm-user';
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

describe('editing workshop accounts atomically', () => {
	it('normalizes contacts and saves them with all roles without journalling personal data', () => {
		const id = insertUser({ email: 'edit@ws.example', role: 'carpenter', counterpartyId: null });
		const changed = service().update(
			updateCrmUserSchema.parse({
				id,
				fullName: '  Алексей Петров  ',
				email: '  Updated@WS.example ',
				phone: ' +7 (900) 111-22-33 ',
				roles: ['painter', 'driver']
			})
		);

		expect(changed).toMatchObject({
			id,
			fullName: 'Алексей Петров',
			email: 'updated@ws.example',
			phone: '+7 (900) 111-22-33',
			roles: ['painter', 'driver']
		});
		const [entry] = db.select().from(auditLog).where(eq(auditLog.action, 'crm_user.update')).all();
		expect(entry).toMatchObject({
			actorId: ownerId,
			entity: 'users',
			entityId: id,
			before: { roles: ['carpenter'] },
			after: { changed: ['fullName', 'email', 'phone'], roles: ['painter', 'driver'] }
		});
		for (const value of [changed.fullName, changed.email, changed.phone]) {
			expect(JSON.stringify(entry)).not.toContain(value);
		}
	});

	it('reserves addresses across portal and deleted accounts without a partial edit', () => {
		const id = insertUser({
			email: 'unchanged@ws.example',
			role: 'carpenter',
			counterpartyId: null
		});
		const reservedId = insertUser({
			email: 'Reserved@ws.example',
			role: 'driver',
			counterpartyId: null
		});
		db.update(users)
			.set({ deletedAt: new Date(), isActive: false })
			.where(eq(users.id, reservedId))
			.run();
		for (const email of [' ADMIN@RS.example ', ' reserved@ws.example ']) {
			expect(() =>
				service().update(
					updateCrmUserSchema.parse({
						id,
						fullName: 'Изменённое имя',
						email,
						phone: '',
						roles: ['driver']
					})
				)
			).toThrow(ValidationError);
		}
		expect(new CrmUserRepository().find(id)).toMatchObject({
			fullName: 'Тестовый пользователь',
			email: 'unchanged@ws.example',
			phone: null,
			roles: ['carpenter']
		});
		expect(db.select().from(auditLog).all()).toHaveLength(0);
	});

	it('allows the unchanged own email but refuses to demote oneself without changing contacts', () => {
		const original = new CrmUserRepository().find(ownerId)!;
		const input = {
			id: ownerId,
			fullName: original.fullName,
			email: original.email,
			phone: '',
			roles: ['owner']
		};
		expect(service().update(updateCrmUserSchema.parse(input)).email).toBe(original.email);
		expect(() =>
			service().update(
				updateCrmUserSchema.parse({
					...input,
					fullName: 'Другое имя',
					roles: ['manager']
				})
			)
		).toThrow(ConflictError);
		expect(new CrmUserRepository().find(ownerId)?.fullName).toBe(original.fullName);
	});

	it('rolls contacts back when replacing roles fails', () => {
		const id = insertUser({ email: 'atomic@ws.example', role: 'carpenter', counterpartyId: null });
		// An incomplete seed is a real repository failure after contact data has been written.
		db.delete(roles).where(eq(roles.code, 'upholsterer')).run();
		try {
			expect(() =>
				service().update(
					updateCrmUserSchema.parse({
						id,
						fullName: 'Другое имя',
						email: 'different@ws.example',
						phone: '12345',
						roles: ['upholsterer']
					})
				)
			).toThrow('a CRM role is missing');
			expect(new CrmUserRepository().find(id)).toMatchObject({
				fullName: 'Тестовый пользователь',
				email: 'atomic@ws.example',
				phone: null,
				roles: ['carpenter']
			});
			expect(db.select().from(auditLog).all()).toHaveLength(0);
		} finally {
			db.insert(roles).values({ code: 'upholsterer', title: 'upholsterer' }).run();
		}
	});

	it('refuses to update a portal or missing account', () => {
		const [portal] = db.select().from(users).where(eq(users.scope, 'portal')).all();
		for (const id of [portal!.id, 999_999]) {
			expect(() =>
				service().update(updateCrmUserSchema.parse({ ...input(), phone: '', id }))
			).toThrow(NotFoundError);
		}
	});
});

describe('soft deletion', () => {
	it('revokes every device and hides the account while preserving work, payroll and audit history', () => {
		const id = insertUser({ email: 'remove@ws.example', role: 'carpenter', counterpartyId: null });
		const tokens = [1, 2].map(() => SessionService.create(id, { ip: null, userAgent: null }));
		const worker = db
			.insert(staff)
			.values({ fullName: 'Сотрудник', userId: id })
			.returning()
			.get()!;
		const day = db
			.insert(workDays)
			.values({ workDate: new Date('2025-01-01'), createdById: id })
			.returning()
			.get()!;
		const work = db
			.insert(workTypes)
			.values({ title: 'Сборка', rateMinor: 100 })
			.returning()
			.get()!;
		const entry = db
			.insert(workEntries)
			.values({ workDayId: day.id, workTypeId: work.id, qty: 1, rateMinor: 100, amountMinor: 100 })
			.returning()
			.get()!;
		db.insert(workEntryStaff).values({ workEntryId: entry.id, staffId: worker.id }).run();
		const period = db
			.insert(payrollPeriods)
			.values({ startsOn: new Date('2025-01-01'), endsOn: new Date('2025-01-07'), closedById: id })
			.returning()
			.get()!;
		const line = db
			.insert(payrollLines)
			.values({ periodId: period.id, staffId: worker.id, accruedMinor: 100, payoutMinor: 100 })
			.returning()
			.get()!;
		db.insert(auditLog)
			.values({
				actorId: id,
				action: 'auth.login',
				entity: 'users',
				entityId: id,
				requestId: 'old-login'
			})
			.run();
		try {
			service().delete(id);
			expect(db.select().from(users).where(eq(users.id, id)).get()).toMatchObject({
				isActive: false,
				deletedAt: expect.any(Date)
			});
			expect(tokens.map((token) => SessionService.resolve(token))).toEqual([null, null]);
			expect(db.select().from(sessions).where(eq(sessions.userId, id)).all()).toHaveLength(0);
			expect(new CrmUserRepository().find(id)).toBeUndefined();
			expect(
				service()
					.list({ page: 1, perPage: 50 })
					.rows.map((row) => row.id)
			).not.toContain(id);
			expect(db.select().from(staff).where(eq(staff.id, worker.id)).get()?.userId).toBe(id);
			expect(
				db.select().from(workEntries).where(eq(workEntries.id, entry.id)).get()?.amountMinor
			).toBe(100);
			expect(
				db.select().from(payrollLines).where(eq(payrollLines.id, line.id)).get()?.payoutMinor
			).toBe(100);
			expect(db.select().from(auditLog).where(eq(auditLog.actorId, id)).all()).toHaveLength(1);
			const deletion = db
				.select()
				.from(auditLog)
				.where(eq(auditLog.action, 'crm_user.delete'))
				.get();
			expect(deletion).toMatchObject({
				entityId: id,
				before: { isActive: true, deleted: false },
				after: { isActive: false, deleted: true }
			});
			expect(JSON.stringify(deletion)).not.toContain('remove@ws.example');
			expect(() => service().setActive(id, true)).toThrow(NotFoundError);
		} finally {
			db.delete(payrollPeriods).where(eq(payrollPeriods.id, period.id)).run();
			db.delete(workDays).where(eq(workDays.id, day.id)).run();
			db.delete(workTypes).where(eq(workTypes.id, work.id)).run();
			db.delete(staff).where(eq(staff.id, worker.id)).run();
		}
	});

	it('refuses to delete the own, portal or unknown account', () => {
		const [portal] = db.select().from(users).where(eq(users.scope, 'portal')).all();
		expect(() => service().delete(ownerId)).toThrow(ConflictError);
		expect(() => service().delete(portal!.id)).toThrow(NotFoundError);
		expect(() => service().delete(999_999)).toThrow(NotFoundError);
		expect(db.select().from(auditLog).all()).toHaveLength(0);
	});
});
