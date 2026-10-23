import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { ForbiddenError, NotFoundError, ValidationError } from '../../src/lib/server/core/errors';
import { auditLog, financeEntries } from '../../src/lib/server/db/schema';
import { FinanceEntryService } from '../../src/lib/server/finance/finance-entry.service';
import { startOfDayInZone } from '../../src/lib/domain/time/zone';
import {
	financeDeleteSchema,
	financeEntrySchema,
	financeEntryUpdateSchema
} from '../../src/lib/validation/finance';
import { insertUser, migratedDatabase } from './helpers/db';
import { crmActor } from './helpers/portal-requests';

const db = migratedDatabase();
const TZ = 'Europe/Moscow';
const NOW = new Date('2026-10-23T09:00:00Z');
const ownerId = insertUser({ email: 'own@c18.example', role: 'owner', counterpartyId: null });
const managerId = insertUser({ email: 'mgr@c18.example', role: 'manager', counterpartyId: null });
const owner = crmActor('owner', ownerId);

const service = () => new FinanceEntryService(owner, undefined, TZ, () => NOW);
const form = (patch: Record<string, string> = {}) => ({
	kind: 'expense',
	amountMinor: '4500000',
	occurredOn: '2026-10-20',
	comment: 'Аренда цеха',
	...patch
});
const create = (patch: Record<string, string> = {}) =>
	service().create(financeEntrySchema.parse(form(patch)));
const update = (id: number, patch: Record<string, string> = {}) =>
	service().update(financeEntryUpdateSchema.parse({ ...form(patch), id: String(id) }));
const remove = (id: number) => service().remove(financeDeleteSchema.parse({ id: String(id) }));
const rowOf = (id: number) =>
	db.select().from(financeEntries).where(eq(financeEntries.id, id)).all()[0];
const audit = (action: string) =>
	db.select().from(auditLog).where(eq(auditLog.action, action)).all();

beforeEach(() => {
	db.delete(financeEntries).run();
	db.delete(auditLog).run();
});

describe('manual finance entries (C18, tech.md v1.58)', () => {
	it('records the day in the workshop zone and audits the entry', () => {
		const id = create();

		expect(rowOf(id)).toMatchObject({
			kind: 'expense',
			amountMinor: 4_500_000,
			occurredAt: startOfDayInZone('2026-10-20', TZ),
			comment: 'Аренда цеха',
			createdById: ownerId,
			deletedAt: null
		});
		expect(audit('finance.entry.create')).toEqual([
			expect.objectContaining({
				actorId: ownerId,
				entity: 'finance_entries',
				entityId: id,
				after: {
					kind: 'expense',
					amountMinor: 4_500_000,
					occurredOn: '2026-10-20',
					comment: 'Аренда цеха'
				}
			})
		]);
	});

	it('takes today and refuses tomorrow', () => {
		expect(() => create({ occurredOn: '2026-10-24' })).toThrow(ValidationError);
		expect(create({ occurredOn: '2026-10-23' })).toBeGreaterThan(0);
	});

	it('refuses a day the calendar does not have', () => {
		expect(() => create({ occurredOn: '2026-02-31' })).toThrow(ValidationError);
	});

	it('edits an entry and keeps the old value in the journal', () => {
		const id = create();

		update(id, { kind: 'income', amountMinor: '200000', comment: 'Продажа обрезков' });

		expect(rowOf(id)).toMatchObject({
			kind: 'income',
			amountMinor: 200_000,
			comment: 'Продажа обрезков'
		});
		const [row] = audit('finance.entry.update');
		expect(row).toMatchObject({
			entityId: id,
			before: { kind: 'expense', amountMinor: 4_500_000, comment: 'Аренда цеха' },
			after: { kind: 'income', amountMinor: 200_000, comment: 'Продажа обрезков' }
		});
	});

	it('deletes softly: the row stays, marked, and the journal says so', () => {
		const id = create();

		remove(id);

		expect(rowOf(id)?.deletedAt).toBeInstanceOf(Date);
		expect(audit('finance.entry.delete')).toEqual([
			expect.objectContaining({
				entityId: id,
				before: expect.objectContaining({ amountMinor: 4_500_000 })
			})
		]);
	});

	it('answers 404 for a deleted or unknown entry', () => {
		const id = create();
		remove(id);

		expect(() => update(id)).toThrow(NotFoundError);
		expect(() => remove(id)).toThrow(NotFoundError);
		expect(() => update(999_999)).toThrow(NotFoundError);
		expect(() => remove(999_999)).toThrow(NotFoundError);
		expect(audit('finance.entry.delete')).toHaveLength(1);
	});

	it('is closed to every role but the owner', () => {
		expect(() => new FinanceEntryService(crmActor('manager', managerId))).toThrow(ForbiddenError);
	});
});
