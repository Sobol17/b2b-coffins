import { syncPayrollStaff } from './seed/payroll-staff';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { createDb } from '../src/lib/server/db/client';
import { config } from '../src/lib/server/config';

const db = createDb(config.DATABASE_PATH);
migrate(db, { migrationsFolder: './drizzle' });
syncPayrollStaff(db);
console.log(`migrations applied to ${config.DATABASE_PATH}`);
