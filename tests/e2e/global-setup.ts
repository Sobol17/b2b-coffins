import { eq } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { hashPassword } from '../../src/lib/server/auth/password';
import { createDb, type Db } from '../../src/lib/server/db/client';
import { rateLimits, roles, sessions, userRoles, users } from '../../src/lib/server/db/schema';
import { TEMP_ACCOUNTS } from './fixtures';
import { seedCatalog, seedStockItems } from '../../scripts/seed/catalog';
import {
	seedCounterparties,
	seedCrmUsers,
	seedPriceLists,
	seedStaff
} from '../../scripts/seed/parties';
import {
	seedDicts,
	seedNotificationRules,
	seedNumbering,
	seedRoles,
	seedSettings
} from '../../scripts/seed/reference';

const DATABASE_PATH = './data/e2e.db';

/**
 * E2E runs against the same fixtures as dev. The file is never deleted: Playwright starts the
 * web server before this hook, and unlinking it would leave the server holding a dead inode.
 * The seed is idempotent, so writing into the live file is enough to make a rerun deterministic.
 */
export default async function globalSetup(): Promise<void> {
	const db = createDb(DATABASE_PATH);
	migrate(db, { migrationsFolder: './drizzle' });

	seedRoles(db);
	seedDicts(db);
	seedSettings(db);
	seedNumbering(db);
	seedNotificationRules(db);
	seedStockItems(db);
	seedCatalog(db);
	await seedCrmUsers(db);
	seedStaff(db);
	await seedCounterparties(db, seedPriceLists(db));

	for (const account of Object.values(TEMP_ACCOUNTS)) {
		await resetTempAccount(db, account.email, account.password);
	}

	// Counters and sessions survive a run; clearing them keeps a rerun from hitting a lockout.
	db.delete(rateLimits).run();
	db.delete(sessions).run();
	db.update(users).set({ failedAttempts: 0, lockedUntil: null }).run();
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
