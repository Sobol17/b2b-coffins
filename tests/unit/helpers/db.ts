import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { database, type Db } from '../../../src/lib/server/db/client';
import { counterparties, roles, userRoles, users } from '../../../src/lib/server/db/schema';
import type { RoleCode } from '../../../src/lib/types/roles';

/** Applies the real migrations to the per-file database from tests/unit/setup.ts. */
export function migratedDatabase(): Db {
	migrate(database, { migrationsFolder: './drizzle' });
	return database;
}

export function insertCounterparty(name: string): number {
	const [row] = database.insert(counterparties).values({ name }).returning().all();
	if (!row) throw new Error(`failed to insert counterparty ${name}`);
	return row.id;
}

export function insertUser(input: {
	email: string;
	role: RoleCode;
	counterpartyId: number | null;
	fullName?: string;
	phone?: string | null;
}): number {
	const [user] = database
		.insert(users)
		.values({
			email: input.email,
			passwordHash: 'not-a-real-hash',
			fullName: input.fullName ?? 'Тестовый пользователь',
			phone: input.phone ?? null,
			scope: input.counterpartyId === null ? 'crm' : 'portal',
			counterpartyId: input.counterpartyId
		})
		.returning()
		.all();
	if (!user) throw new Error(`failed to insert user ${input.email}`);

	const [role] = database
		.insert(roles)
		.values({ code: input.role, title: input.role })
		.onConflictDoUpdate({ target: roles.code, set: { title: input.role } })
		.returning()
		.all();
	if (!role) throw new Error(`failed to upsert role ${input.role}`);
	database.insert(userRoles).values({ userId: user.id, roleId: role.id }).run();
	return user.id;
}
