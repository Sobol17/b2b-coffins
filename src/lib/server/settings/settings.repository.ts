import { eq } from 'drizzle-orm';
import { BaseRepository } from '../core/repository';
import { settings } from '../db/schema';

export class SettingsRepository extends BaseRepository<typeof settings> {
	constructor() {
		super(settings);
	}

	/** Raw JSON value. The caller parses it with the schema of that key. */
	findValue(key: string): unknown {
		const [row] = this.db()
			.select({ value: settings.value })
			.from(settings)
			.where(eq(settings.key, key))
			.all();
		return row?.value;
	}
}
