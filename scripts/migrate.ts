import { syncPayrollStaff } from './seed/payroll-staff';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { createDb } from '../src/lib/server/db/client';
import { config } from '../src/lib/server/config';

const db = createDb(config.DATABASE_PATH);
db.$client.pragma('foreign_keys = OFF');
try {
	migrate(db, { migrationsFolder: './drizzle' });
	const violations = db.$client.pragma('foreign_key_check');
	if (Array.isArray(violations) && violations.length > 0)
		throw new Error('Migration left invalid foreign keys');
} finally {
	db.$client.pragma('foreign_keys = ON');
}
syncPayrollStaff(db);
console.log(`migrations applied to ${config.DATABASE_PATH}`);
