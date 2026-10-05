import { and, eq, inArray, isNull, like } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { hashPassword } from '../../src/lib/server/auth/password';
import { createDb, type Db } from '../../src/lib/server/db/client';
import {
	dictItems,
	discountRules,
	rateLimits,
	requests,
	roles,
	sessions,
	stockMoves,
	userNotificationPrefs,
	userRoles,
	users
} from '../../src/lib/server/db/schema';
import { removeCatalogLeftovers } from './catalog-leftovers';
import { TEMP_ACCOUNTS } from './fixtures';
import { seedCatalog, seedStockBalances, seedStockItems } from '../../scripts/seed/catalog';
import {
	seedCounterparties,
	seedCrmUsers,
	seedPriceLists,
	seedStaff,
	seedWorkTypes
} from '../../scripts/seed/parties';
import {
	seedDicts,
	seedNotificationRules,
	seedNotificationTemplates,
	seedNumbering,
	seedRoles,
	seedSettings
} from '../../scripts/seed/reference';

const DATABASE_PATH = './data/e2e.db';
const FILES_DIR = './data/e2e-files';

/**
 * E2E runs against the same fixtures as dev. The file is never deleted: Playwright starts the
 * web server before this hook, and unlinking it would leave the server holding a dead inode.
 * The seed is idempotent, so writing into the live file is enough to make a rerun deterministic.
 */
export default async function globalSetup(): Promise<void> {
	const db = createDb(DATABASE_PATH);
	migrate(db, { migrationsFolder: './drizzle' });
	removeCatalogLeftovers(db, FILES_DIR);
	// Remove the unscoped rule written by earlier C2 test runs.
	db.delete(discountRules)
		.where(
			and(
				eq(discountRules.percent, 7),
				isNull(discountRules.categoryId),
				isNull(discountRules.counterpartyId)
			)
		)
		.run();

	seedRoles(db);
	seedDicts(db);
	seedSettings(db);
	seedNumbering(db);
	seedNotificationRules(db);
	seedNotificationTemplates(db);
	seedStockItems(db);
	seedCatalog(db);
	seedStockBalances(db);
	await seedCrmUsers(db);
	seedStaff(db);
	seedWorkTypes(db);
	await seedCounterparties(db, seedPriceLists(db));

	for (const account of Object.values(TEMP_ACCOUNTS)) {
		await resetTempAccount(db, account.email, account.password);
	}

	// Counters and sessions survive a run; clearing them keeps a rerun from hitting a lockout.
	db.delete(rateLimits).run();
	db.delete(sessions).run();
	// The notifications spec flips switches; every run starts from the role defaults.
	db.delete(userNotificationPrefs).run();
	// Accounts the staff spec creates. They stay in the audit journal, so they are disabled rather
	// than deleted: a disabled account frees its seat of the staff limit for the next run.
	db.update(users).set({ isActive: false }).where(like(users.email, 'e2e.%')).run();
	db.update(users).set({ failedAttempts: 0, lockedUntil: null }).run();
	// The fill of v1.41 hands stock out across every request in work or assembled. Leftovers of an
	// earlier run would take the pieces a spec makes, so a run starts with none of them and no
	// production: the opening balances of the seed stay.
	db.update(requests)
		.set({ status: 'cancelled' })
		.where(inArray(requests.status, ['in_work', 'ready']))
		.run();
	db.delete(stockMoves).where(eq(stockMoves.type, 'production')).run();
	// Items the CRM admin spec adds: nothing references them, so each run starts without them.
	db.delete(dictItems).where(like(dictItems.code, 'e2e%')).run();
}

/** Rewritten on every run: these accounts exist to be changed and locked by the suite. */
async function resetTempAccount(db: Db, email: string, password: string): Promise<void> {
	const [role] = db.select({ id: roles.id }).from(roles).where(eq(roles.code, 'manager')).all();
	if (!role) throw new Error('role manager is missing');

	const passwordHash = await hashPassword(password);
	const [existing] = db.select({ id: users.id }).from(users).where(eq(users.email, email)).all();
	if (existing) {
		db.update(users)
			.set({ passwordHash, mustChangePassword: true, failedAttempts: 0, lockedUntil: null })
			.where(eq(users.id, existing.id))
			.run();
		return;
	}

	const [created] = db
		.insert(users)
		.values({
			email,
			passwordHash,
			fullName: 'Временный доступ',
			scope: 'crm',
			counterpartyId: null,
			mustChangePassword: true
		})
		.returning()
		.all();
	if (!created) throw new Error(`failed to create ${email}`);
	db.insert(userRoles).values({ userId: created.id, roleId: role.id }).onConflictDoNothing().run();
}
