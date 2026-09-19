import { afterAll } from 'vitest';
import { temporaryUnitDatabase } from './helpers/temp-database';

// Every test file gets its own SQLite file: a unit run must never touch the dev database,
// and parallel files must not see each other's rows.
const database = temporaryUnitDatabase();
process.env.DATABASE_PATH = database.path;
afterAll(database.cleanup);
