import { eq } from 'drizzle-orm';
import { BaseRepository } from '../core/repository';
import type { Tx } from '../db/client';
import { settings } from '../db/schema';

export class SettingsRepository extends BaseRepository<typeof settings> {
	constructor() {
		super(settings);
	}

	/** Raw JSON value. The caller parses it with the schema of that key. */
	findValue(key: string, tx?: Tx): unknown {
		const [row] = this.db(tx)
			.select({ value: settings.value })
			.from(settings)
			.where(eq(settings.key, key))
			.all();
		return row?.value;
	}

	/** Upsert of one key. The caller validated the value against the schema of that key. */
	save(key: string, value: unknown, updatedById: number, tx?: Tx): void {
		this.db(tx)
			.insert(settings)
			.values({ key, value, updatedById })
			.onConflictDoUpdate({
				target: settings.key,
				set: { value, updatedById, updatedAt: new Date() }
			})
			.run();
	}
}
