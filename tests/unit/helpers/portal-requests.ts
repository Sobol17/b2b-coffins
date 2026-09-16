import { and, eq } from 'drizzle-orm';
import { seedCatalog, seedStockItems } from '../../../scripts/seed/catalog';
import { seedPriceLists } from '../../../scripts/seed/parties';
import { seedDicts, seedNumbering, seedSettings } from '../../../scripts/seed/reference';
import { PolicyService } from '../../../src/lib/server/auth/policy';
import type { Db } from '../../../src/lib/server/db/client';
import {
	auditLog,
	counterparties,
	deliveryAddresses,
	jobQueue,
	options,
	productVariants,
	rateLimits,
	requests
} from '../../../src/lib/server/db/schema';
import type { ActorContext } from '../../../src/lib/types/actor';
import type { RoleCode } from '../../../src/lib/types/roles';
import { insertCounterparty, insertUser } from './db';

export interface OrderingWorld {
	readonly cpId: number;
	readonly otherCpId: number;
	readonly adminId: number;
	readonly employeeId: number;
	readonly outsiderId: number;
	readonly homeAddressId: number;
	readonly foreignAddressId: number;
}

/** Catalog, prices and two counterparties with their people: the ground every P4 test orders on. */
export function seedOrderingWorld(db: Db): OrderingWorld {
	seedDicts(db);
	seedStockItems(db);
	seedCatalog(db);
	seedNumbering(db);
	// A delivery freezes the charity rate from settings (P8), so the world carries the seeded ones.
	seedSettings(db);
	const lists = seedPriceLists(db);
	const [cp] = db
		.insert(counterparties)
		.values({
			name: 'Ритуал-Сервис',
			priceListId: lists.get('partner') ?? null,
			discountPercent: 5
		})
		.returning()
		.all();
	const cpId = cp?.id ?? 0;
	const otherCpId = insertCounterparty('Память');
	const [home] = db
		.insert(deliveryAddresses)
		.values({
			counterpartyId: cpId,
			title: 'Склад',
			address: 'Москва, Полевая, 12',
			isDefault: true
		})
		.returning()
		.all();
	const [foreign] = db
		.insert(deliveryAddresses)
		.values({
			counterpartyId: otherCpId,
			title: 'Чужой склад',
			address: 'Балашиха',
			isDefault: true
		})
		.returning()
		.all();
	return {
		cpId,
		otherCpId,
		adminId: insertUser({
			email: 'admin@rs.example',
			role: 'cp_admin',
			counterpartyId: cpId,
			fullName: 'Ольга Смирнова'
		}),
		employeeId: insertUser({
			email: 'employee@rs.example',
			role: 'cp_employee',
			counterpartyId: cpId,
			fullName: 'Илья Коротков'
		}),
		outsiderId: insertUser({
			email: 'admin@pamyat.example',
			role: 'cp_admin',
			counterpartyId: otherCpId
		}),
		homeAddressId: home?.id ?? 0,
		foreignAddressId: foreign?.id ?? 0
	};
}

export function resetRequests(db: Db): void {
	db.delete(requests).run();
	db.delete(jobQueue).run();
	db.delete(auditLog).run();
	db.delete(rateLimits).run();
}

export function portalActor(
	role: RoleCode,
	userId: number,
	counterpartyId: number | null
): ActorContext {
	const roles = [role];
	return {
		userId,
		roles,
		scope: PolicyService.scopeOf(roles),
		counterpartyId,
		canSeePrices: PolicyService.canSeePrices(roles),
		canSeeCost: PolicyService.canSeeCost(roles),
		requestId: 'portal-request-test'
	};
}

export function variantId(db: Db, sku: string): number {
	const [row] = db
		.select({ id: productVariants.id })
		.from(productVariants)
		.where(eq(productVariants.sku, sku))
		.all();
	if (!row) throw new Error(`no variant ${sku}`);
	return row.id;
}

export function optionId(db: Db, title: string): number {
	const [row] = db
		.select({ id: options.id })
		.from(options)
		.where(and(eq(options.title, title)))
		.all();
	if (!row) throw new Error(`no option ${title}`);
	return row.id;
}

/** A workshop actor: CRM scope, no counterparty row filter. */
export function crmActor(role: RoleCode, userId: number): ActorContext {
	return portalActor(role, userId, null);
}
