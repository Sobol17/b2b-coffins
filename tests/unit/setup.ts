import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Every test file gets its own SQLite file: a unit run must never touch the dev database,
// and parallel files must not see each other's rows.
process.env.DATABASE_PATH = join(mkdtempSync(join(tmpdir(), 'b2b-unit-')), 'unit.db');
