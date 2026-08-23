import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { createDb } from '../src/lib/server/db/client';
import { config } from '../src/lib/server/config';

const db = createDb(config.DATABASE_PATH);
migrate(db, { migrationsFolder: './drizzle' });
console.log(`migrations applied to ${config.DATABASE_PATH}`);
