import { and, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { ForbiddenError, NotFoundError } from '../../src/lib/server/core/errors';
import { auditLog, users } from '../../src/lib/server/db/schema';
import { ProfileService } from '../../src/lib/server/profile/profile.service';
import type { ActorContext } from '../../src/lib/types/actor';
import type { RoleCode } from '../../src/lib/types/roles';
import { updateProfileSchema } from '../../src/lib/validation/profile';
import { insertCounterparty, insertUser, migratedDatabase } from './helpers/db';

const db = migratedDatabase();
const ownCp = insertCounterparty('Ритуал-Сервис');
const otherCp = insertCounterparty('Вечность');
const employeeId = insertUser({
	email: 'employee@ritual.example',
	role: 'cp_employee',
	counterpartyId: ownCp,
	fullName: 'Ольга Гущина',
	phone: '+7 916 222-22-22'
});

function actor(
	overrides: Partial<ActorContext> & { roles?: readonly RoleCode[] } = {}
): ActorContext {
	return {
		userId: employeeId,
		roles: ['cp_employee'],
		scope: 'portal',
		counterpartyId: ownCp,
		canSeePrices: false,
		canSeeCost: false,
		requestId: 'req-profile-test',
		...overrides
	};
}

beforeEach(() => {
	db.update(users)
		.set({ fullName: 'Ольга Гущина', phone: '+7 916 222-22-22', email: 'employee@ritual.example' })
		.where(eq(users.id, employeeId))
		.run();
	db.delete(auditLog).run();
});

describe('profile form contract', () => {
	it('trims the name and canonicalizes the required phone', () => {
		const parsed = updateProfileSchema.parse({
			fullName: '  Ольга Гущина ',
			phone: '8 (900) 123-45-67'
		});

		expect(parsed).toEqual({ fullName: 'Ольга Гущина', phone: '+79001234567' });
	});

	it('drops an e-mail smuggled into the form', () => {
		const parsed = updateProfileSchema.parse({
			fullName: 'Ольга',
			phone: '+7 916 000-00-00',
			email: 'attacker@evil.example'
		});

		expect(parsed).not.toHaveProperty('email');
	});

	it('rejects a phone with letters and a one-letter name', () => {
		expect(updateProfileSchema.safeParse({ fullName: 'Ольга', phone: 'call me' }).success).toBe(
			false
		);
		expect(updateProfileSchema.safeParse({ fullName: 'О', phone: '' }).success).toBe(false);
	});
});

describe('ProfileService', () => {
	it('returns the own profile without the row id', () => {
		expect(new ProfileService(actor()).get()).toEqual({
			fullName: 'Ольга Гущина',
			phone: '+7 916 222-22-22',
			email: 'employee@ritual.example'
		});
	});

	it('saves the contact and journals changed field names, not the values', () => {
		const dto = new ProfileService(actor()).update({
			fullName: 'Ольга Петрова',
			phone: '+79001234567'
		});

		expect(dto).toMatchObject({ fullName: 'Ольга Петрова', phone: '+79001234567' });
		const [row] = db.select().from(users).where(eq(users.id, employeeId)).all();
		expect(row).toMatchObject({ fullName: 'Ольга Петрова', phone: '+79001234567' });

		const entries = db
			.select()
			.from(auditLog)
			.where(and(eq(auditLog.action, 'profile.update'), eq(auditLog.entityId, employeeId)))
			.all();
		expect(entries).toHaveLength(1);
		expect(entries[0]).toMatchObject({
			actorId: employeeId,
			entity: 'users',
			requestId: 'req-profile-test',
			after: { changed: ['fullName', 'phone'] }
		});
		expect(JSON.stringify(entries[0])).not.toContain('Петрова');
	});

	it('does not find the row when the actor carries another counterparty', () => {
		const service = new ProfileService(actor({ counterpartyId: otherCp }));

		expect(() => service.get()).toThrow(NotFoundError);
		expect(() => service.update({ fullName: 'Чужой', phone: '+79001234567' })).toThrow(
			NotFoundError
		);
		expect(db.select().from(auditLog).all()).toHaveLength(0);
	});

	it('refuses a CRM actor before touching the database', () => {
		const crm = actor({ roles: ['manager'], scope: 'crm', counterpartyId: null });

		expect(() =>
			new ProfileService(crm).update({ fullName: 'Менеджер', phone: '+79001234567' })
		).toThrow(ForbiddenError);
		expect(db.select().from(auditLog).all()).toHaveLength(0);
	});
});

it('returns a form refusal when the profile phone belongs to another account', async () => {
	const { actions } = await import('../../src/routes/(portal)/portal/profile/+page.server');
	insertUser({
		email: 'taken@example.com',
		phone: '+79501234567',
		role: 'owner',
		counterpartyId: null
	});
	const result = await actions.default({
		request: new Request('http://localhost/portal/profile', {
			method: 'POST',
			body: new URLSearchParams({ fullName: 'Ольга Гущина', phone: '+79501234567' })
		}),
		locals: { actor: actor() },
		url: new URL('http://localhost/portal/profile')
	} as Parameters<typeof actions.default>[0]);
	expect(result).toMatchObject({
		status: 422,
		data: { formError: 'Этот телефон уже используется' }
	});
	expect(new ProfileService(actor()).get().phone).toBe('+7 916 222-22-22');
});
