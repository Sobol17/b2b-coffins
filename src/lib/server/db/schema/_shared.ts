import { integer } from 'drizzle-orm/sqlite-core';

export const pk = () => integer('id').primaryKey({ autoIncrement: true });
export const ts = (name: string) => integer(name, { mode: 'timestamp' });
export const createdAt = () =>
	ts('created_at')
		.notNull()
		.$defaultFn(() => new Date());
export const updatedAt = () =>
	ts('updated_at')
		.notNull()
		.$defaultFn(() => new Date())
		.$onUpdate(() => new Date());
/** Money is always an integer of minor units. `real` under money is forbidden. */
export const money = (name: string) => integer(name).notNull().default(0);
export const bool = (name: string) => integer(name, { mode: 'boolean' });
