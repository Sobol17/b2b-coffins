import { database } from '../src/lib/server/db/client';
import { counterpartyCreate } from './admin/counterparty';
import { priceImport } from './admin/price';
import { requestTransition } from './admin/request';
import { userCreate } from './admin/user';

const USAGE = `pnpm admin <command> [options]

  user:create          --email --name --role --password [--counterparty] [--phone]
  counterparty:create  --name --price-list --admin-email --admin-name --admin-password
                       [--discount] [--scheme] [--inn] [--address] [--phone] [--email]
  price:import         --file <xlsx|csv> --price-list
  request:transition   --request <number> --to <status> --actor <email> [--reason] [--comment]
`;

async function main(): Promise<void> {
	const [command, ...argv] = process.argv.slice(2);
	// The same handle the services hold: the console must not race its own process over WAL.
	const db = database;

	switch (command) {
		case 'user:create':
			return userCreate(db, argv);
		case 'counterparty:create':
			return counterpartyCreate(db, argv);
		case 'price:import':
			return priceImport(db, argv);
		case 'request:transition':
			return requestTransition(db, argv);
		default:
			console.error(USAGE);
			process.exit(1);
	}
}

main().catch((err: unknown) => {
	console.error(err instanceof Error ? err.message : err);
	process.exit(1);
});
