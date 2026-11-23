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

const manager = actorOf('manager', managerId);
const access = () => new CounterpartyAccessService(manager);

beforeEach(() => {
	db.delete(rateLimits).run();
	db.delete(auditLog).run();
});

describe('who may manage counterparties', () => {
	it('lets only the owner and the manager in, and only inside the CRM', () => {
		const refused: RoleCode[] = ['carpenter', 'painter', 'driver', 'cp_admin', 'cp_employee'];
		for (const role of refused) {
			const ctx = actorOf(role, carpenterId, role.startsWith('cp_') ? 1 : null);
			expect(() => new CrmCounterpartyService(ctx)).toThrow(ForbiddenError);
			expect(() => new CounterpartyAccessService(ctx)).toThrow(ForbiddenError);
			expect(() => new CounterpartyDetailService(ctx)).toThrow(ForbiddenError);
			expect(() => new CounterpartyLedgerService(ctx)).toThrow(ForbiddenError);
		}
		expect(() => new CrmCounterpartyService(actorOf('owner', managerId))).not.toThrow();
	});
});

describe('CRM counterparty creation', () => {
	it('keeps the terms and default seat limit, without journaling contact information', () => {
		const input = newCounterparty({
			managerId: String(managerId),
			email: 'contact@agency.example'
		});
		const id = new CrmCounterpartyService(manager).create(input);
		const row = db.select().from(counterparties).where(eq(counterparties.id, id)).get();
		expect(row).toMatchObject({
			name: input.requisites.name,
			inn: '7701234567',
			discountPercent: 3,
			settlementScheme: 'weekly',
			managerId,
			staffLimit: 2
		});
		const [entry] = db.select().from(auditLog).all();
		expect(entry).toMatchObject({
			action: 'counterparty.create',
			entity: 'counterparties',
			entityId: id,
			actorId: managerId
		});
		expect(JSON.stringify(entry)).not.toContain('contact@agency.example');
	});

	it('refuses invalid terms without saving the card', () => {
		const service = new CrmCounterpartyService(manager);
		const before = db.select().from(counterparties).all().length;
		expect(() => service.create(newCounterparty({ managerId: String(carpenterId) }))).toThrow(
			ValidationError
		);
		expect(() => service.create(newCounterparty({ regionPriceListId: '999' }))).toThrow(
			ValidationError
		);
		expect(db.select().from(counterparties).all()).toHaveLength(before);
		expect(db.select().from(auditLog).all()).toHaveLength(0);
	});
});

const create = () => new CrmCounterpartyService(manager).create(newCounterparty());

describe('administrators and access of an existing counterparty', () => {
	it('issues another administrator within the staff limit only', async () => {
		const counterpartyId = create();
		const issued = await access().issueAdmin(counterpartyId, {
			fullName: 'Иван Петров',
			email: 'ivan.issue@agency.example',
			phone: '+79301234567'
		});

		expect(issued.member.role).toBe('cp_admin');
		expect(issued.mailSent).toBe(false);
		await expect(
			access().issueAdmin(counterpartyId, {
				fullName: 'Второй Администратор',
				email: 'second@agency.example',
				phone: '+79301234568'
			})
		).resolves.toMatchObject({ member: { role: 'cp_admin' } });
		await expect(
			access().issueAdmin(counterpartyId, {
				fullName: 'Третий Лишний',
				email: null,
				phone: '+79301234570'
			})
		).rejects.toThrow(ConflictError);
	});

	it('promotes an active employee and journals the old role', () => {
		const counterpartyId = create();
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
		const counterpartyId = create();
		const first = await access().issueAdmin(counterpartyId, {
			fullName: 'Пароль Заново',
			email: 'reset@agency.example',
			phone: '+79301234571'
		});
		const adminId = first.member.id;
		SessionService.create(adminId, { ip: null, userAgent: null });

		const again = await access().resendAccess(counterpartyId, adminId);
		const [row] = db.select().from(users).where(eq(users.id, adminId)).all();
		expect(again.mailSent).toBe(false);
		expect(await verifyPassword(row?.passwordHash ?? '', again.temporaryPassword)).toBe(true);
		expect(db.select().from(sessions).where(eq(sessions.userId, adminId)).all()).toHaveLength(0);

		db.update(users).set({ isActive: false }).where(eq(users.id, adminId)).run();
		await expect(access().resendAccess(counterpartyId, adminId)).rejects.toThrow(ConflictError);
	});

	it('never reaches a person of another counterparty through this one', async () => {
		const own = create();
		const other = await access().issueAdmin(create(), {
			fullName: 'Чужой Администратор',
			email: null,
			phone: '+79301234572'
		});

		expect(() => access().promoteAdmin(own, other.member.id)).toThrow(NotFoundError);
		await expect(access().resendAccess(own, other.member.id)).rejects.toThrow(NotFoundError);
	});
});
