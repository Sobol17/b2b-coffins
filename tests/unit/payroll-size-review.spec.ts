import { readFileSync } from 'node:fs';
import { eq } from 'drizzle-orm';
import { beforeEach, expect, it } from 'vitest';
import { sqlite } from '../../src/lib/server/db/client';
import { dictItems, products, productVariants, workTypes } from '../../src/lib/server/db/schema';
import { WorkDayService } from '../../src/lib/server/crm-payroll/work-day.service';
import { WorkTypeService } from '../../src/lib/server/crm-payroll/work-type.service';
import { CrmVariantService } from '../../src/lib/server/crm-catalog/variant.service';
import { variantInputSchema } from '../../src/lib/validation/crm-catalog';
import { workDaySaveSchema } from '../../src/lib/validation/crm-payroll';
import { calendarAt, clearPayroll, insertStaff, payrollActor } from './helpers/crm-payroll';
import { insertUser, migratedDatabase } from './helpers/db';
const db = migratedDatabase();
const actor = payrollActor(
	insertUser({ email: 'size-review@test.example', role: 'manager', counterpartyId: null })
);
const material = db
	.insert(dictItems)
	.values({ dict: 'material', code: 'size-pine', title: 'Сосна' })
	.returning()
	.get()!.id;
const oak = db
	.insert(dictItems)
	.values({ dict: 'material', code: 'size-oak', title: 'Дуб' })
	.returning()
	.get()!.id;
const productId = db
	.insert(products)
	.values({ sku: 'SIZE-REVIEW', title: 'Модель' })
	.returning()
	.get()!.id;
const variants = db
	.insert(productVariants)
	.values(
		[180, 190].map((size) => ({
			productId,
			materialId: material,
			sku: `SIZE-${size}`,
			sizeCode: String(size)
		}))
	)
	.returning()
	.all();
beforeEach(clearPayroll);
it('preserves distinct historical work identities and prices when a migrated day is resaved', () => {
	const staffId = insertStaff('Мастер');
	const ids = db
		.insert(workTypes)
		.values(
			variants.map((v, i) => ({
				title: `Работа ${i}`,
				variantId: v.id,
				roleCode: 'carpenter' as const,
				rateMinor: (i + 1) * 10000
			}))
		)
		.returning()
		.all()
		.map((w) => w.id);
	const days = new WorkDayService(actor, calendarAt('2026-10-07T12:00:00Z'));
	const before = days.save({
		date: '2026-10-07',
		staffIds: [staffId],
		entries: ids.map((workTypeId) => ({ workTypeId, qty: 1, staffIds: [staffId] }))
	});
	db.update(workTypes).set({ rateMinor: 35000 }).run();
	sqlite.transaction(() =>
		sqlite.exec(readFileSync('drizzle/0027_work_rates_without_sizes.sql', 'utf8'))
	)();
	const loaded = days.get('2026-10-07');
	const input = workDaySaveSchema.parse({
		date: loaded.date,
		staffIds: [staffId],
		entries: loaded.entries
	});
	const after = days.save(input);
	expect(after.totalMinor).toBe(before.totalMinor);
	expect(after.entries.map((e) => [e.workTypeId, e.rateMinor, e.staffIds])).toEqual(
		before.entries.map((e) => [e.workTypeId, e.rateMinor, e.staffIds])
	);
	expect(new WorkTypeService(actor).list()).toHaveLength(1);
	expect(loaded.workTypes).toHaveLength(2);
});
it('refuses a material change that would move a shared payroll rate', () => {
	new WorkTypeService(actor).create({
		title: 'Сосна',
		variantId: variants[0]!.id,
		roleCode: 'carpenter',
		rateMinor: 35000
	});
	const input = variantInputSchema.parse({ ...variants[0], materialId: oak });
	expect(() => new CrmVariantService(actor).updateVariant(variants[0]!.id, input)).toThrow(
		/расцен/
	);
	expect(
		db.select().from(productVariants).where(eq(productVariants.id, variants[0]!.id)).get()!
			.materialId
	).toBe(material);
});
