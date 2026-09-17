import { database } from '../src/lib/server/db/client';
import { seedDemo } from './seed/demo';

// The services write through the shared handle, so the script must not open a second one.
seedDemo(database)
	.then((summary) => console.log(JSON.stringify(summary, null, 2)))
	.catch((err: unknown) => {
		console.error(err instanceof Error ? err.message : err);
		process.exit(1);
	});
