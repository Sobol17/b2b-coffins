import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { PolicyService } from '../../src/lib/server/auth/policy';
import { ForbiddenError, ValidationError } from '../../src/lib/server/core/errors';
import { auditLog, dictItems } from '../../src/lib/server/db/schema';
import { DictService } from '../../src/lib/server/dicts/dict.service';
import type { ActorContext } from '../../src/lib/types/actor';
import type { RoleCode } from '../../src/lib/types/roles';
import { createDictItemSchema, dictFiltersSchema } from '../../src/lib/validation/dicts';
import { insertUser, migratedDatabase } from './helpers/db';

const db = migratedDatabase();
const ownerId = insertUser({ email: 'owner@ws.example', role: 'owner', counterpartyId: null });

function actor(role: RoleCode = 'owner'): ActorContext {
	const roles = [role];
	return {
		userId: ownerId,
		roles,
		scope: PolicyService.scopeOf(roles),
		counterpartyId: null,
		canSeePrices: PolicyService.canSeePrices(roles),
		canSeeCost: PolicyService.canSeeCost(roles),
		requestId: 'dicts-test'
	};
}

const service = (ctx: ActorContext = actor()) => new DictService(ctx);

beforeEach(() => {
	db.delete(auditLog).run();
	db.delete(dictItems).run();
});

describe('dictionaries of dict_items', () => {
	it('lets only the owner in', () => {
		for (const role of ['manager', 'carpenter', 'painter', 'driver'] as const) {
			expect(() => service(actor(role))).toThrow(ForbiddenError);
		}
	});

	it('adds an item to one dictionary and journals it', () => {
		const item = service().create({
			dict: 'material',
			code: 'larch',
			title: 'Лиственница',
			sortOrder: 60
		});

		const materials = service().list({ page: 1, perPage: 50, filters: { dict: 'material' } });
		const units = service().list({ page: 1, perPage: 50, filters: { dict: 'unit' } });
		expect(materials.rows).toEqual([item]);
		expect(units.rows).toEqual([]);
		expect(db.select().from(auditLog).all()).toEqual([
			expect.objectContaining({ action: 'dict.create', entity: 'dict_items', entityId: item.id })
		]);
	});

	it('refuses a code the dictionary already holds, but not the same code in another one', () => {
		service().create({ dict: 'unit', code: 'pcs', title: 'шт', sortOrder: 10 });
		expect(() =>
			service().create({ dict: 'unit', code: 'pcs', title: 'штуки', sortOrder: 20 })
		).toThrow(ValidationError);
		expect(
			service().create({ dict: 'transport', code: 'pcs', title: 'Газель', sortOrder: 0 }).code
		).toBe('pcs');
	});

	it('edits the title and the order but never the code', () => {
		const item = service().create({ dict: 'finish', code: 'matte', title: 'Мат', sortOrder: 5 });
		const edited = service().update({ id: item.id, title: 'Матовая', sortOrder: 10 });

		expect(edited).toMatchObject({ code: 'matte', title: 'Матовая', sortOrder: 10 });
		const [entry] = db.select().from(auditLog).where(eq(auditLog.action, 'dict.update')).all();
		expect(entry?.before).toEqual({ title: 'Мат', sortOrder: 5 });
		expect(entry?.after).toEqual({ title: 'Матовая', sortOrder: 10 });
	});

	it('switches an item off instead of deleting it', () => {
		const item = service().create({
			dict: 'work_type',
			code: 'sawing',
			title: 'Раскрой',
			sortOrder: 0
		});
		expect(service().setActive(item.id, false).isActive).toBe(false);
		expect(db.select().from(dictItems).where(eq(dictItems.id, item.id)).all()).toHaveLength(1);
		expect(service().setActive(item.id, true).isActive).toBe(true);
		expect(
			db
				.select({ action: auditLog.action })
				.from(auditLog)
				.all()
				.map((row) => row.action)
		).toEqual(['dict.create', 'dict.disable', 'dict.enable']);
	});

	it('keeps codes latin and falls back to the first dictionary on a tampered filter', () => {
		const base = { dict: 'material', title: 'Дуб', sortOrder: '0' };
		expect(createDictItemSchema.safeParse({ ...base, code: 'дуб' }).success).toBe(false);
		expect(createDictItemSchema.safeParse({ ...base, code: 'red oak' }).success).toBe(false);
		expect(createDictItemSchema.parse({ ...base, code: ' Oak_2 ' }).code).toBe('oak_2');
		expect(dictFiltersSchema.parse({ dict: 'claims' }).dict).toBe('material');
	});
});
