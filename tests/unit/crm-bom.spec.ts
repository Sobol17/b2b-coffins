import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import {
	ConflictError,
	ForbiddenError,
	NotFoundError,
	ValidationError
} from '../../src/lib/server/core/errors';
import { normalizeListQuery } from '../../src/lib/server/core/list';
import { BomService } from '../../src/lib/server/crm-bom/bom.service';
import { auditLog, bomVersions, productVariants } from '../../src/lib/server/db/schema';
import type { RoleCode } from '../../src/lib/types/roles';
import { bomNormCreateSchema, bomNormUpdateSchema } from '../../src/lib/validation/crm-bom';
import { stockItemId } from './helpers/crm-stock';
import { insertUser, migratedDatabase } from './helpers/db';
import { crmActor, portalActor, seedOrderingWorld, variantId } from './helpers/portal-requests';

const db = migratedDatabase();
const world = seedOrderingWorld(db);
const managerId = insertUser({ email: 'mgr@c9n.example', role: 'manager', counterpartyId: null });
const manager = crmActor('manager', managerId);
const carpenter = crmActor('carpenter', managerId);

const VOLGA_180 = variantId(db, 'MDL-201-180-PIN');
const LADA_180 = variantId(db, 'MDL-101-180-CHB');
const PINE = stockItemId(db, 'CMP-BOARD-PINE');
const LACQUER = stockItemId(db, 'CMP-LACQUER');
const VOLGA_SHELF = stockItemId(db, 'MDL-201-180-PIN');

const bom = (ctx = manager) => new BomService(ctx);
const normsOf = (versionId: number) =>
	bom().norms(versionId, normalizeListQuery({ perPage: 200 })).rows;
const audit = (action: string) =>
	db.select().from(auditLog).where(eq(auditLog.action, action)).all();
const norm = (variant: number, componentId: number, qtyPerUnitMilli: number) =>
	bom().createNorm({ variantId: variant, componentId, qtyPerUnitMilli });

beforeEach(() => {
	db.delete(bomVersions).run();
	db.delete(auditLog).run();
});

describe('rights on the norms (C9)', () => {
	it('opens to a role with stock.read and keeps every write for stock.manage', () => {
		expect(bom(carpenter).page()).toMatchObject({ versions: [], shown: null, canManage: false });
		expect(() => bom(carpenter).createVersion()).toThrow(ForbiddenError);
		expect(() => bom(carpenter).activate(1)).toThrow(ForbiddenError);
		expect(() =>
			bom(carpenter).createNorm({ variantId: 1, componentId: 1, qtyPerUnitMilli: 1 })
		).toThrow(ForbiddenError);
		expect(() => bom(carpenter).updateNorm({ normId: 1, qtyPerUnitMilli: 1 })).toThrow(
			ForbiddenError
		);
		expect(() => bom(carpenter).deleteNorm(1)).toThrow(ForbiddenError);
	});

	it('is closed to the driver and to the portal: they get 403', () => {
		const strangers: RoleCode[] = ['driver'];
		for (const role of strangers)
			expect(() => bom(crmActor(role, managerId))).toThrow(ForbiddenError);
		expect(() => bom(portalActor('cp_admin', world.adminId, world.cpId))).toThrow(ForbiddenError);
	});
});

describe('versions of the norms (C9)', () => {
	it('numbers versions in a row and keeps exactly one active', () => {
		const first = bom().createVersion();
		const second = bom().createVersion();

		const page = bom().page();
		expect(page.versions.map((row) => [row.id, row.version, row.isActive])).toEqual([
			[second, 2, true],
			[first, 1, false]
		]);
		expect(page.shown?.id).toBe(second);
		expect(page.canEdit).toBe(true);
	});

	it('starts a new version from the norms of the active one', () => {
		const first = bom().createVersion();
		norm(VOLGA_180, PINE, 2400);
		norm(VOLGA_180, LACQUER, 350);

		const second = bom().createVersion();

		const pairs = (id: number) => normsOf(id).map((row) => [row.componentId, row.qtyPerUnitMilli]);
		expect(pairs(second)).toEqual(pairs(first));
		expect(audit('bom.version.create')[1]?.after).toMatchObject({
			version: 2,
			copiedFromId: first
		});
	});

	it('brings an old version back and shows the others as read-only', () => {
		const first = bom().createVersion();
		const second = bom().createVersion();

		expect(bom().page(first)).toMatchObject({ shown: { id: first }, canEdit: false });
		bom().activate(first);

		expect(bom().page().shown).toMatchObject({ id: first, isActive: true });
		expect(bom().page(second).canEdit).toBe(false);
		expect(audit('bom.version.activate')[0]).toMatchObject({
			entityId: first,
			before: { activeId: second },
			after: { activeId: first }
		});
		expect(() => bom().activate(first)).toThrow(ConflictError);
		expect(() => bom().activate(999_999)).toThrow(NotFoundError);
	});
});

describe('manual edits of the norms (C9)', () => {
	it('adds, changes and removes a norm of the active version, each with an audit row', () => {
		const version = bom().createVersion();
		const id = norm(VOLGA_180, PINE, 2400);

		expect(normsOf(version)).toEqual([
			expect.objectContaining({
				id,
				variantSku: 'MDL-201-180-PIN',
				componentCode: 'CMP-BOARD-PINE',
				unitTitle: 'м2',
				qtyPerUnitMilli: 2400
			})
		]);
		bom().updateNorm({ normId: id, qtyPerUnitMilli: 2600 });
		expect(normsOf(version)[0]?.qtyPerUnitMilli).toBe(2600);
		bom().deleteNorm(id);
		expect(normsOf(version)).toEqual([]);

		expect(audit('bom.norm.create')[0]?.after).toMatchObject({
			bomVersionId: version,
			componentId: PINE
		});
		expect(audit('bom.norm.update')[0]).toMatchObject({
			before: { qtyPerUnitMilli: 2400 },
			after: { qtyPerUnitMilli: 2600 }
		});
		expect(audit('bom.norm.delete')[0]?.before).toMatchObject({ variantId: VOLGA_180 });
	});

	it('refuses a norm without an active version', () => {
		expect(() => norm(VOLGA_180, PINE, 1000)).toThrow(ConflictError);
	});

	it('refuses a second norm of the pair, a product as a component and a deleted variant', () => {
		bom().createVersion();
		norm(VOLGA_180, PINE, 1000);

		expect(() => norm(VOLGA_180, PINE, 2000)).toThrow(ValidationError);
		expect(() => norm(VOLGA_180, VOLGA_SHELF, 1000)).toThrow(ValidationError);
		db.update(productVariants)
			.set({ deletedAt: new Date() })
			.where(eq(productVariants.id, LADA_180))
			.run();
		expect(() => norm(LADA_180, PINE, 1000)).toThrow(ValidationError);
		db.update(productVariants)
			.set({ deletedAt: null })
			.where(eq(productVariants.id, LADA_180))
			.run();
	});

	it('keeps the norms of an old version from edits', () => {
		const first = bom().createVersion();
		const id = norm(VOLGA_180, PINE, 1000);
		bom().createVersion();
		const old = normsOf(first)[0]?.id ?? 0;

		expect(old).toBe(id);
		expect(() => bom().updateNorm({ normId: old, qtyPerUnitMilli: 5 })).toThrow(ConflictError);
		expect(() => bom().deleteNorm(old)).toThrow(ConflictError);
		expect(() => bom().deleteNorm(999_999)).toThrow(NotFoundError);
		expect(normsOf(first)[0]?.qtyPerUnitMilli).toBe(1000);
	});

	it('finds a norm by the article and by the component', () => {
		const version = bom().createVersion();
		norm(VOLGA_180, PINE, 1000);
		norm(LADA_180, LACQUER, 350);

		const search = (text: string) =>
			bom()
				.norms(version, normalizeListQuery({ search: text }))
				.rows.map((row) => row.variantId);

		expect(search('mdl-201')).toEqual([VOLGA_180]);
		expect(search('лак')).toEqual([LADA_180]);
	});

	it('reads the norm as typed on paper and refuses what is not a norm', () => {
		const parse = (qty: string) =>
			bomNormCreateSchema.safeParse({ variantId: '3', componentId: '4', qtyPerUnitMilli: qty });

		expect(parse('0,35').data).toEqual({ variantId: 3, componentId: 4, qtyPerUnitMilli: 350 });
		expect(['', '0', '-1', '0,0001', 'много'].map((qty) => parse(qty).success)).toEqual([
			false,
			false,
			false,
			false,
			false
		]);
		expect(bomNormUpdateSchema.safeParse({ normId: '7', qtyPerUnitMilli: '2.5' }).data).toEqual({
			normId: 7,
			qtyPerUnitMilli: 2500
		});
		expect(
			bomNormCreateSchema.safeParse({ variantId: '', componentId: '4', qtyPerUnitMilli: '1' })
				.success
		).toBe(false);
	});
});
