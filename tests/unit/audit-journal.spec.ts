import { beforeEach, describe, expect, it } from 'vitest';
import { AuditJournalService } from '../../src/lib/server/audit/audit-journal.service';
import { AuditService } from '../../src/lib/server/audit/audit.service';
import { PolicyService } from '../../src/lib/server/auth/policy';
import { ForbiddenError } from '../../src/lib/server/core/errors';
import { auditLog, settings } from '../../src/lib/server/db/schema';
import type { ActorContext } from '../../src/lib/types/actor';
import type { RoleCode } from '../../src/lib/types/roles';
import { auditFiltersSchema } from '../../src/lib/validation/audit';
import { insertUser, migratedDatabase } from './helpers/db';

const db = migratedDatabase();
const ownerId = insertUser({
	email: 'owner@ws.example',
	role: 'owner',
	counterpartyId: null,
	fullName: 'Игорь Соболев'
});
const managerId = insertUser({
	email: 'manager@ws.example',
	role: 'manager',
	counterpartyId: null,
	fullName: 'Марина Круглова'
});

function actor(role: RoleCode = 'owner'): ActorContext {
	const roles = [role];
	return {
		userId: ownerId,
		roles,
		scope: PolicyService.scopeOf(roles),
		counterpartyId: null,
		canSeePrices: PolicyService.canSeePrices(roles),
		canSeeCost: PolicyService.canSeeCost(roles),
		requestId: 'audit-test'
	};
}

const journal = (ctx: ActorContext = actor()) => new AuditJournalService(ctx);

beforeEach(() => {
	db.delete(auditLog).run();
	db.delete(settings).run();
	db.insert(settings).values({ key: 'org.timezone', value: 'Europe/Moscow' }).run();
	// Only the first entry exists when the update runs, so it alone moves to 20 September.
	AuditService.record({
		actorId: ownerId,
		action: 'dict.create',
		entity: 'dict_items',
		entityId: 1
	});
	db.update(auditLog)
		.set({ createdAt: new Date('2026-09-20T10:00:00Z') })
		.run();
	AuditService.record({ actorId: managerId, action: 'auth.login', entity: 'users', entityId: 2 });
	AuditService.record({
		actorId: ownerId,
		action: 'settings.update',
		entity: 'settings',
		entityId: null
	});
});

describe('audit journal', () => {
	it("is the owner's alone", () => {
		expect(() => journal(actor('manager'))).toThrow(ForbiddenError);
		expect(() => journal(actor('carpenter'))).toThrow(ForbiddenError);
	});

	it('lists the newest entry first with the actor name', () => {
		const page = journal().list({ page: 1, perPage: 10 });
		expect(page.total).toBe(3);
		expect(page.rows.map((row) => row.action)).toEqual([
			'settings.update',
			'auth.login',
			'dict.create'
		]);
		expect(page.rows[1]?.actorName).toBe('Марина Круглова');
		expect(page.actions).toEqual(['auth.login', 'dict.create', 'settings.update']);
		expect(page.entities).toEqual(['dict_items', 'settings', 'users']);
	});

	it('filters by action, entity and a part of the actor name', () => {
		const by = (filters: Record<string, string>) =>
			journal()
				.list({ page: 1, perPage: 10, filters: auditFiltersSchema.parse(filters) })
				.rows.map((row) => row.action);
		expect(by({ action: 'auth.login' })).toEqual(['auth.login']);
		expect(by({ entity: 'dict_items' })).toEqual(['dict.create']);
		expect(by({ actor: 'соболев' })).toEqual(['settings.update', 'dict.create']);
		expect(by({ action: '', entity: '' })).toHaveLength(3);
	});

	it('filters by calendar days of the workshop timezone', () => {
		const filters = auditFiltersSchema.parse({ from: '2026-09-20', to: '2026-09-20' });
		expect(
			journal()
				.list({ page: 1, perPage: 10, filters })
				.rows.map((row) => row.action)
		).toEqual(['dict.create']);
		expect(auditFiltersSchema.parse({ from: 'вчера' }).from).toBeUndefined();
	});
});
