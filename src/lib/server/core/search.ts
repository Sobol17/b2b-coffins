import { sql, type SQL, type SQLWrapper } from 'drizzle-orm';

/** SQLite folds case for ASCII only, so the app registers its own Unicode lower() (db/client.ts). */
export const UNICODE_LOWER = 'unicode_lower';

/**
 * "Column contains the text", case-insensitive for Cyrillic too. The input goes in as a bound
 * parameter with its LIKE wildcards escaped: a typed "%" must not match the whole table.
 */
export function containsText(column: SQLWrapper, input: string): SQL {
	const escaped = input.toLowerCase().replace(/[\\%_]/g, (char) => `\\${char}`);
	return sql`${sql.raw(UNICODE_LOWER)}(${column}) like ${`%${escaped}%`} escape '\\'`;
}
