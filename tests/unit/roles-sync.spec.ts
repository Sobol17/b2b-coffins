import { inArray } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { rolesSync } from '../../scripts/admin/roles';
import { ROLE_TITLE } from '../../src/lib/crm/labels';
import { roles } from '../../src/lib/server/db/schema';
import { ROLE_CODES } from '../../src/lib/types/roles';
import { migratedDatabase } from './helpers/db';

const db = migratedDatabase();

describe('roles:sync on a stand without the seed (v1.61)', () => {
	it('adds the grinder and the upholsterer once, under the titles the CRM shows', () => {
		rolesSync(db);
		// A stand from before v1.61: the two shop roles are not there yet.
		db.delete(roles)
			.where(inArray(roles.code, ['grinder', 'upholsterer']))
			.run();

		rolesSync(db);
		rolesSync(db);

		const rows = db.select({ code: roles.code, title: roles.title }).from(roles).all();
		expect(rows.map((row) => row.code).sort()).toEqual([...ROLE_CODES].sort());
		for (const row of rows) expect(row.title).toBe(ROLE_TITLE[row.code]);
	});
});
