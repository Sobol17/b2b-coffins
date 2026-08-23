import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { config } from '../config';
import * as schema from './schema';

export function openSqlite(databasePath: string): Database.Database {
	const absolute = resolve(databasePath);
	mkdirSync(dirname(absolute), { recursive: true });

	const sqlite = new Database(absolute);
	// WAL lets the queue worker write while a request reads. busy_timeout absorbs the overlap.
	sqlite.pragma('journal_mode = WAL');
	sqlite.pragma('busy_timeout = 5000');
	sqlite.pragma('foreign_keys = ON');
	sqlite.pragma('synchronous = NORMAL');
	return sqlite;
}

export function createDb(databasePath: string) {
	return drizzle(openSqlite(databasePath), { schema });
}

export const sqlite = openSqlite(config.DATABASE_PATH);
export const database = drizzle(sqlite, { schema });

export type Db = typeof database;
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
