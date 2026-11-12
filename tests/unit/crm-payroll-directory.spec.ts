import { ShopUnitWorkRepository } from '../../src/lib/server/crm-shop/shop-unit-work.repository';
import { beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { ForbiddenError, NotFoundError, ValidationError } from '../../src/lib/server/core/errors';
import { PayrollStaffService } from '../../src/lib/server/crm-payroll/payroll-staff.service';
import { WorkTypeService } from '../../src/lib/server/crm-payroll/work-type.service';
import {
	auditLog,
	dictItems,
	products,
	productVariants,
	staff as staffTable,
	users,
	workTypes
} from '../../src/lib/server/db/schema';
import {
	staffCreateSchema,
	staffUpdateSchema,
	workTypeCreateSchema,
	workTypeUpdateSchema
} from '../../src/lib/validation/crm-payroll';
import { clearPayroll, payrollActor } from './helpers/crm-payroll';
import { insertUser, migratedDatabase } from './helpers/db';

const db = migratedDatabase();
const managerId = insertUser({
	email: 'manager@ws.example',
	role: 'manager',
	counterpartyId: null
});

const staff = (role: Parameters<typeof payrollActor>[1] = 'manager') =>
	new PayrollStaffService(payrollActor(managerId, role));
const works = (role: Parameters<typeof payrollActor>[1] = 'manager') =>
	new WorkTypeService(payrollActor(managerId, role));
const actions = () => db.select({ action: auditLog.action }).from(auditLog).all();

const materialId = db
	.insert(dictItems)
	.values({ dict: 'material', code: 'pine', title: 'Сосна' })
	.returning()
	.get()!.id;
let sequence = 0;
function variant(deleted = false): number {
	sequence += 1;
	const product = db
		.insert(products)
		.values({ sku: `MODEL-${sequence}`, title: 'Прямой' })
		.returning()
		.get()!;
	return db
		.insert(productVariants)
		.values({
			productId: product.id,
			sku: `SKU-${sequence}`,
			sizeCode: '180',
			materialId,
			deletedAt: deleted ? new Date() : null
		})
		.returning()
		.get()!.id;
}

function account(options: { portal?: boolean; deleted?: boolean } = {}): number {
	sequence += 1;
	const id = insertUser({
		email: `worker${sequence}@ws.example`,
		role: 'carpenter',
		counterpartyId: null,
		fullName: `Сотрудник ${sequence}`
	});
	if (options.portal || options.deleted)
		db.update(users)
			.set({
				scope: options.portal ? 'portal' : 'crm',
				deletedAt: options.deleted ? new Date() : null
			})
			.where(eq(users.id, id))
			.run();
	return id;
}

beforeEach(clearPayroll);

describe('who opens the payroll section', () => {
	it('lets the owner and the administrator in and nobody else', () => {
		for (const role of ['owner', 'manager'] as const) {
			expect(staff(role).list()).toEqual([]);
			expect(works(role).list()).toEqual([]);
		}
		for (const role of ['carpenter', 'painter', 'driver', 'cp_admin', 'cp_employee'] as const) {
			expect(() => staff(role)).toThrow(ForbiddenError);
			expect(() => works(role)).toThrow(ForbiddenError);
		}
	});
});

describe('the crew directory', () => {
	it('adds a worker and journals it without the name', () => {
		const worker = staff().create({ fullName: 'Алексей Дроздов', position: 'Столяр' });

		expect(staff().list()).toEqual([
			{
				...worker,
				fullName: 'Алексей Дроздов',
				position: 'Столяр',
				isActive: true,
				hasAccount: false
			}
		]);
		const [row] = db.select().from(auditLog).all();
		expect(row).toMatchObject({ action: 'staff.create', entity: 'staff', entityId: worker.id });
		expect(JSON.stringify(row)).not.toContain('Дроздов');
	});

	it('edits the name and the position', () => {
		const worker = staff().create({ fullName: 'Роман Тихонов', position: null });
		const edited = staff().update({ id: worker.id, fullName: 'Роман Тихонов', position: 'Маляр' });
		expect(edited.position).toBe('Маляр');
		expect(() => staff().update({ id: 999, fullName: 'Нет', position: null })).toThrow(
			NotFoundError
		);
	});

	it('switches a worker off instead of deleting, and lists the active first', () => {
		const first = staff().create({ fullName: 'Анна', position: null });
		staff().create({ fullName: 'Яков', position: null });
		staff().setActive(first.id, false);

		expect(
			staff()
				.list()
				.map((row) => [row.fullName, row.isActive])
		).toEqual([
			['Яков', true],
			['Анна', false]
		]);
		expect(actions().map((row) => row.action)).toContain('staff.disable');
		expect(staff().setActive(first.id, true).isActive).toBe(true);
	});

	it('requires a name', () => {
		expect(staffCreateSchema.safeParse({ fullName: '  ', position: '' }).success).toBe(false);
		expect(staffCreateSchema.parse({ fullName: ' Юрий Савин ', position: '' })).toEqual({
			fullName: 'Юрий Савин',
			position: null
		});
	});
});

describe('works of a shop role (v1.61)', () => {
	it('lists the works in the order of the shop floor, the general ones last', () => {
		works().create({ title: 'Упаковка', rateMinor: 3_000, roleCode: null });
		works().create({ title: 'Обивка крышки', rateMinor: 10_000, roleCode: 'upholsterer' });
		works().create({ title: 'Лакировка', rateMinor: 12_000, roleCode: 'painter' });
		works().create({ title: 'Шлифовка', rateMinor: 8_000, roleCode: 'grinder' });
		works().create({ title: 'Сборка ящика', rateMinor: 20_000, roleCode: 'carpenter' });

		expect(
			works()
				.list()
				.map((work) => [work.roleCode, work.title])
		).toEqual([
			['carpenter', 'Сборка ящика'],
			['grinder', 'Шлифовка'],
			['painter', 'Лакировка'],
			['upholsterer', 'Обивка крышки'],
			[null, 'Упаковка']
		]);
	});

	it('moves a work to another role and journals the move', () => {
		const work = works().create({ title: 'Шлифовка', rateMinor: 8_000, roleCode: 'carpenter' });

		works().update({ id: work.id, title: 'Шлифовка', rateMinor: 8_000, roleCode: 'grinder' });

		expect(works().list()[0]?.roleCode).toBe('grinder');
		expect(db.select().from(auditLog).all().at(-1)).toMatchObject({
			action: 'work_type.update',
			before: { roleCode: 'carpenter' },
			after: { roleCode: 'grinder' }
		});
	});

	it('takes a shop role or nothing, never an office role', () => {
		const parse = (roleCode: string) =>
			workTypeCreateSchema.safeParse({ title: 'Раскрой', rateMinor: '15000', roleCode });
		expect(parse('upholsterer').data?.roleCode).toBe('upholsterer');
		expect(parse('').data?.roleCode).toBeNull();
		expect(parse('driver').success).toBe(false);
		expect(parse('owner').success).toBe(false);
	});
});

describe('works and their prices', () => {
	it('keeps a work as a title and a price of one unit', () => {
		const work = works().create({ title: 'Сборка ящика', rateMinor: 20_000, roleCode: null });
		expect(works().list()).toEqual([
			{
				id: work.id,
				title: 'Сборка ящика',
				rateMinor: 20_000,
				roleCode: null,
				variantId: null,
				variantLabel: null,
				isActive: true
			}
		]);
		expect(actions()).toEqual([{ action: 'work_type.create' }]);
	});

	it('refuses a second work with the same title', () => {
		const work = works().create({ title: 'Шлифовка', rateMinor: 8_000, roleCode: null });
		expect(() => works().create({ title: 'Шлифовка', rateMinor: 9_000, roleCode: null })).toThrow(
			ValidationError
		);
		const other = works().create({ title: 'Лакировка', rateMinor: 12_000, roleCode: null });
		expect(() =>
			works().update({ id: other.id, title: 'Шлифовка', rateMinor: 1_000, roleCode: null })
		).toThrow(ValidationError);
		// Saving a work under its own title is not a clash.
		expect(
			works().update({ id: work.id, title: 'Шлифовка', rateMinor: 9_000, roleCode: null }).rateMinor
		).toBe(9_000);
	});

	it('journals the old and the new price', () => {
		const work = works().create({ title: 'Обивка', rateMinor: 10_000, roleCode: null });
		works().update({ id: work.id, title: 'Обивка', rateMinor: 11_000, roleCode: null });
		const row = db.select().from(auditLog).all().at(-1);
		expect(row).toMatchObject({
			action: 'work_type.update',
			before: { title: 'Обивка', rateMinor: 10_000, roleCode: null },
			after: { title: 'Обивка', rateMinor: 11_000, roleCode: null }
		});
	});

	it('switches a work off and on', () => {
		const work = works().create({ title: 'Упаковка', rateMinor: 3_000, roleCode: null });
		expect(works().setActive(work.id, false).isActive).toBe(false);
		expect(works().list()[0]?.isActive).toBe(false);
		expect(() => works().setActive(999, true)).toThrow(NotFoundError);
	});

	it('takes a price in whole roubles only', () => {
		expect(workTypeCreateSchema.safeParse({ title: 'Раскрой', rateMinor: '15000' }).success).toBe(
			true
		);
		expect(workTypeCreateSchema.safeParse({ title: 'Раскрой', rateMinor: '15050' }).success).toBe(
			false
		);
		expect(workTypeCreateSchema.safeParse({ title: 'Раскрой', rateMinor: '-100' }).success).toBe(
			false
		);
	});
});

describe('prices for a catalog position', () => {
	it('returns the linked variant and a descriptive label, including an explicit zero rate', () => {
		const variantId = variant();
		const work = works().create({
			title: 'Расценка за позицию',
			rateMinor: 0,
			roleCode: 'carpenter',
			variantId
		});
		expect(work).toMatchObject({
			variantId,
			rateMinor: 0,
			roleCode: 'carpenter',
			variantLabel: expect.stringContaining('Прямой')
		});
		expect(work.variantLabel).toContain('Сосна');
		expect(works().list()[0]?.variantId).toBe(variantId);
	});

	it('refuses duplicate position and role even when the first price is disabled, without a partial edit', () => {
		const variantId = variant();
		const first = works().create({
			title: 'Первая расценка',
			rateMinor: 0,
			roleCode: 'carpenter',
			variantId
		});
		works().setActive(first.id, false);
		expect(() =>
			works().create({ title: 'Другая расценка', rateMinor: 100, roleCode: 'carpenter', variantId })
		).toThrow(ValidationError);
		const other = works().create({
			title: 'Малярная расценка',
			rateMinor: 200,
			roleCode: 'painter',
			variantId
		});
		expect(() =>
			works().update({
				...other,
				title: 'Не сохранится',
				rateMinor: 300,
				roleCode: 'carpenter',
				variantId
			})
		).toThrow(ValidationError);
		expect(
			works()
				.list()
				.find((work) => work.id === other.id)
		).toMatchObject({ title: 'Малярная расценка', rateMinor: 200, roleCode: 'painter', variantId });
	});

	it('rejects a missing station, unknown or deleted variant and deleted model', () => {
		const live = variant();
		const deleted = variant(true);
		const deletedModel = variant();
		const row = db
			.select()
			.from(productVariants)
			.where(eq(productVariants.id, deletedModel))
			.get()!;
		db.update(products).set({ deletedAt: new Date() }).where(eq(products.id, row.productId)).run();
		for (const input of [
			{ variantId: live, roleCode: null },
			{ variantId: 999_999, roleCode: 'carpenter' as const },
			{ variantId: deleted, roleCode: 'carpenter' as const },
			{ variantId: deletedModel, roleCode: 'carpenter' as const }
		]) {
			expect(() =>
				works().create({ title: 'Неверная расценка', rateMinor: 100, ...input })
			).toThrow(ValidationError);
		}
		expect(db.select().from(workTypes).all()).toHaveLength(0);
		expect(actions()).toHaveLength(0);
	});

	it('preserves a link omitted by an old caller, but explicitly clears an empty form field', () => {
		const variantId = variant();
		const work = works().create({
			title: 'Старая форма',
			rateMinor: 100,
			roleCode: 'carpenter',
			variantId
		});
		const preserved = works().update({
			id: work.id,
			title: work.title,
			rateMinor: 200,
			roleCode: 'carpenter'
		});
		expect(preserved.variantId).toBe(variantId);
		const cleared = works().update(workTypeUpdateSchema.parse({ ...preserved, variantId: '' }));
		expect(cleared.variantId).toBeNull();
	});

	it('audits the old and new position, role and price', () => {
		const previous = variant();
		const next = variant();
		const work = works().create({
			title: 'Смена позиции',
			rateMinor: 100,
			roleCode: 'carpenter',
			variantId: previous
		});
		works().update({
			id: work.id,
			title: work.title,
			rateMinor: 200,
			roleCode: 'painter',
			variantId: next
		});
		expect(db.select().from(auditLog).all().at(-1)).toMatchObject({
			before: { variantId: previous, roleCode: 'carpenter', rateMinor: 100 },
			after: { variantId: next, roleCode: 'painter', rateMinor: 200 }
		});
	});

	it('offers undeleted model/material positions without size or price fields', () => {
		const id = variant();
		const removedId = variant(true);
		const choices = works().variantChoices();
		const choice = choices.find((row) => row.id === id)!;
		expect(Object.keys(choice).sort()).toEqual(['id', 'label']);
		expect(choice.label).toMatch(/MODEL-\d+.*Прямой.*Сосна/);
		expect(choices.some((row) => row.id === removedId)).toBe(false);
	});
});

describe('staff account links', () => {
	it('returns a linked account id, preserves it for old calls, and clears it explicitly', () => {
		const userId = account();
		const worker = staff().create({ fullName: 'Связанный сотрудник', position: null, userId });
		expect(worker).toMatchObject({ userId, hasAccount: true });
		expect(
			staff().update({ id: worker.id, fullName: worker.fullName, position: 'Столяр' }).userId
		).toBe(userId);
		expect(
			staff().update(staffUpdateSchema.parse({ ...worker, position: 'Столяр', userId: '' }))
		).toMatchObject({ userId: null, hasAccount: false });
	});

	it('reserves a link held by inactive staff and rejects the whole conflicting edit', () => {
		const userId = account();
		const first = staff().create({ fullName: 'Первый', position: null, userId });
		staff().setActive(first.id, false);
		expect(() => staff().create({ fullName: 'Дубль', position: null, userId })).toThrow(
			ValidationError
		);
		const other = staff().create({ fullName: 'Другой', position: null });
		expect(() => staff().update({ ...other, fullName: 'Не сохранится', userId })).toThrow(
			ValidationError
		);
		expect(
			staff()
				.list()
				.find((row) => row.id === other.id)
		).toMatchObject({ fullName: 'Другой', userId: null });
		expect(db.select().from(staffTable).all()).toHaveLength(2);
	});

	it('refuses missing, portal and deleted accounts without inserting staff or audit', () => {
		for (const userId of [999_999, account({ portal: true }), account({ deleted: true })]) {
			expect(() => staff().create({ fullName: 'Не создан', position: null, userId })).toThrow(
				ValidationError
			);
		}
		expect(staff().list()).toHaveLength(0);
		expect(actions()).toHaveLength(0);
	});

	it('offers only CRM account ids and names, excluding deleted accounts', () => {
		const id = account();
		const portalId = account({ portal: true });
		const deletedId = account({ deleted: true });
		const choices = staff().userChoices();
		const choice = choices.find((row) => row.id === id)!;
		expect(Object.keys(choice).sort()).toEqual(['fullName', 'id']);
		expect(choice.fullName).toMatch(/^Сотрудник /);
		expect(choices.some((row) => [portalId, deletedId].includes(row.id))).toBe(false);
	});
});

it('shares a model/material rate across sizes, including sizes added later', () => {
	const first = variant();
	const source = db.select().from(productVariants).where(eq(productVariants.id, first)).get()!;
	const second = db
		.insert(productVariants)
		.values({ productId: source.productId, materialId, sku: `SECOND-${sequence}`, sizeCode: '190' })
		.returning()
		.get()!.id;
	const rate = works().create({
		title: 'Общая расценка',
		rateMinor: 35000,
		roleCode: 'carpenter',
		variantId: second
	});
	const later = db
		.insert(productVariants)
		.values({ productId: source.productId, materialId, sku: `LATER-${sequence}`, sizeCode: '200' })
		.returning()
		.get()!.id;
	db.transaction((tx) =>
		expect(new ShopUnitWorkRepository().rate(later, 'carpenter', tx)).toEqual({
			id: rate.id,
			rateMinor: 35000
		})
	);
	db.update(productVariants)
		.set({ deletedAt: new Date() })
		.where(eq(productVariants.id, first))
		.run();
	expect(works().update({ ...rate, rateMinor: 42000 }).rateMinor).toBe(42000);

	expect(rate.variantId).toBe(first);
	db.transaction((tx) =>
		expect(new ShopUnitWorkRepository().rate(second, 'carpenter', tx)).toEqual({
			id: rate.id,
			rateMinor: 42000
		})
	);
	expect(
		works()
			.variantChoices()
			.filter((v) => [first, second].includes(v.id))
	).toHaveLength(1);
	expect(() =>
		works().create({
			title: 'Дубль размера',
			rateMinor: 40000,
			roleCode: 'carpenter',
			variantId: first
		})
	).toThrow(ValidationError);
});
