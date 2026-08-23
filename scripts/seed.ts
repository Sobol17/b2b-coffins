import { config } from '../src/lib/server/config';
import { createDb } from '../src/lib/server/db/client';
import { seedCatalog, seedStockItems } from './seed/catalog';
import { seedCounterparties, seedCrmUsers, seedPriceLists, seedStaff } from './seed/parties';
import {
	seedDicts,
	seedNotificationRules,
	seedNumbering,
	seedRoles,
	seedSettings
} from './seed/reference';

// Idempotent by design: dev, tests and fake drivers all run against this one data set.
async function main(): Promise<void> {
	const db = createDb(config.DATABASE_PATH);

	const summary = {
		roles: seedRoles(db),
		dicts: seedDicts(db),
		settings: seedSettings(db),
		numbering: seedNumbering(db),
		notificationRules: seedNotificationRules(db),
		stockItems: seedStockItems(db),
		catalog: seedCatalog(db),
		crmUsers: await seedCrmUsers(db),
		staff: seedStaff(db)
	};

	const priceListIds = seedPriceLists(db);
	const parties = await seedCounterparties(db, priceListIds);

	console.log(JSON.stringify({ database: config.DATABASE_PATH, ...summary, ...parties }, null, 2));
}

main().catch((err: unknown) => {
	console.error(err);
	process.exit(1);
});
