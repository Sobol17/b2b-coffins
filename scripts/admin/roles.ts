import type { Db } from '../../src/lib/server/db/client';
import { seedRoles } from '../seed/reference';

/**
 * Adds the roles of a new core version to a stand that never runs the seed (v1.61: grinder and
 * upholsterer). Titles follow the fixture; a second run changes nothing.
 */
export function rolesSync(db: Db): void {
	const count = db.transaction(() => seedRoles(db));
	console.log(JSON.stringify({ roles: count }));
}
