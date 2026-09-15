import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { hashPassword } from '../../src/lib/server/auth/password';
import type { Db } from '../../src/lib/server/db/client';
import {
	counterparties,
	deliveryAddresses,
	priceListItems,
	priceLists,
	productVariants,
	roles,
	staff,
	userRoles,
	users
} from '../../src/lib/server/db/schema';
import type { RoleCode } from '../../src/lib/types/roles';
import {
	counterpartyFixture,
	crmUserFixture,
	loadFixture,
	priceListFixture,
	staffFixture
} from './schema';

function roleIdByCode(db: Db, code: RoleCode): number {
	const [row] = db.select({ id: roles.id }).from(roles).where(eq(roles.code, code)).all();
	if (!row) throw new Error(`role ${code} is missing, seed roles first`);
	return row.id;
}

/** Idempotent by e-mail: re-running the seed keeps the existing password hash and roles. */
async function upsertUser(
	db: Db,
	input: {
		email: string;
		fullName: string;
		phone?: string | undefined;
		password: string;
		scope: 'portal' | 'crm';
		role: RoleCode;
		counterpartyId: number | null;
	}
): Promise<number> {
	const [existing] = db
		.select({ id: users.id })
		.from(users)
		.where(eq(users.email, input.email))
		.all();
	const userId =
		existing?.id ??
		db
			.insert(users)
			.values({
				email: input.email,
				passwordHash: await hashPassword(input.password),
				fullName: input.fullName,
				phone: input.phone ?? null,
				scope: input.scope,
				counterpartyId: input.counterpartyId,
				// Seed accounts are demo credentials, not temporary ones handed to a real person.
				mustChangePassword: false
			})
			.returning()
			.all()[0]?.id;
	if (userId === undefined) throw new Error(`failed to upsert user ${input.email}`);

	db.insert(userRoles)
		.values({ userId, roleId: roleIdByCode(db, input.role) })
		.onConflictDoNothing()
		.run();
	return userId;
}

export function seedPriceLists(db: Db): Map<string, number> {
	const fixtures = loadFixture('price-lists.json', z.array(priceListFixture));
	const ids = new Map<string, number>();

	for (const fixture of fixtures) {
		const [existing] = db
			.select({ id: priceLists.id })
			.from(priceLists)
			.where(eq(priceLists.title, fixture.title))
			.all();
		const id =
			existing?.id ??
			db
				.insert(priceLists)
				.values({ title: fixture.title, isBase: fixture.isBase })
				.returning()
				.all()[0]?.id;
		if (id === undefined) throw new Error(`failed to upsert price list ${fixture.code}`);
		ids.set(fixture.code, id);

		for (const item of fixture.items) {
			const [variant] = db
				.select({ id: productVariants.id })
				.from(productVariants)
				.where(eq(productVariants.sku, item.variantSku))
				.all();
			if (!variant)
				throw new Error(`price list ${fixture.code} references unknown ${item.variantSku}`);
			db.insert(priceListItems)
				.values({ priceListId: id, variantId: variant.id, priceMinor: item.priceMinor })
				.onConflictDoUpdate({
					target: [priceListItems.priceListId, priceListItems.variantId],
					set: { priceMinor: item.priceMinor }
				})
				.run();
		}
	}
	return ids;
}

function userIdByEmail(db: Db, email: string): number {
	const [row] = db.select({ id: users.id }).from(users).where(eq(users.email, email)).all();
	if (!row) throw new Error(`manager ${email} is missing, seed CRM users first`);
	return row.id;
}

type CounterpartyValues = typeof counterparties.$inferInsert;

/** Name is the natural key of the fixture; the table itself has no unique index on it. */
function upsertCounterparty(db: Db, name: string, values: CounterpartyValues): number {
	const [existing] = db
		.select({ id: counterparties.id })
		.from(counterparties)
		.where(eq(counterparties.name, name))
		.all();
	if (existing) {
		db.update(counterparties).set(values).where(eq(counterparties.id, existing.id)).run();
		return existing.id;
	}
	const [inserted] = db.insert(counterparties).values(values).returning().all();
	if (!inserted) throw new Error(`failed to upsert counterparty ${name}`);
	return inserted.id;
}

export async function seedCounterparties(
	db: Db,
	priceListIds: Map<string, number>
): Promise<{ counterparties: number; users: number }> {
	const fixtures = loadFixture('counterparties.json', z.array(counterpartyFixture));
	let userCount = 0;

	for (const fixture of fixtures) {
		const priceListId = priceListIds.get(fixture.priceList);
		if (!priceListId) throw new Error(`unknown price list ${fixture.priceList}`);

		const values = {
			name: fixture.name,
			legalName: fixture.legalName ?? null,
			inn: fixture.inn ?? null,
			kpp: fixture.kpp ?? null,
			address: fixture.address ?? null,
			phone: fixture.phone ?? null,
			email: fixture.email ?? null,
			priceListId,
			discountPercent: fixture.discountPercent,
			settlementScheme: fixture.settlementScheme,
			staffLimit: fixture.staffLimit,
			managerId: fixture.manager ? userIdByEmail(db, fixture.manager) : null
		};
		const counterpartyId = upsertCounterparty(db, fixture.name, values);

		for (const address of fixture.addresses) {
			const [found] = db
				.select({ id: deliveryAddresses.id })
				.from(deliveryAddresses)
				.where(
					and(
						eq(deliveryAddresses.counterpartyId, counterpartyId),
						eq(deliveryAddresses.title, address.title)
					)
				)
				.all();
			if (found) continue;
			db.insert(deliveryAddresses)
				.values({
					counterpartyId,
					title: address.title,
					address: address.address,
					contactName: address.contactName ?? null,
					contactPhone: address.contactPhone ?? null,
					isDefault: address.isDefault
				})
				.run();
		}

		for (const user of fixture.users) {
			await upsertUser(db, { ...user, scope: 'portal', counterpartyId });
			userCount += 1;
		}
	}
	return { counterparties: fixtures.length, users: userCount };
}

export async function seedCrmUsers(db: Db): Promise<number> {
	const fixtures = loadFixture('crm-users.json', z.array(crmUserFixture));
	for (const fixture of fixtures) {
		const userId = await upsertUser(db, { ...fixture, scope: 'crm', counterpartyId: null });
		upsertStaff(db, fixture.fullName, fixture.staffPosition, userId);
	}
	return fixtures.length;
}

export function seedStaff(db: Db): number {
	const fixtures = loadFixture('staff.json', z.array(staffFixture));
	for (const fixture of fixtures) upsertStaff(db, fixture.fullName, fixture.position, null);
	return fixtures.length;
}

function upsertStaff(db: Db, fullName: string, position: string, userId: number | null): void {
	const [existing] = db
		.select({ id: staff.id })
		.from(staff)
		.where(eq(staff.fullName, fullName))
		.all();
	if (existing) {
		db.update(staff).set({ position, userId }).where(eq(staff.id, existing.id)).run();
		return;
	}
	db.insert(staff).values({ fullName, position, userId }).run();
}
