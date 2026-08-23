import { database, type Db, type Tx } from '../db/client';

/**
 * A service opens the transaction; repositories receive `tx` as a parameter. Nesting reuses the
 * outer transaction, because SQLite gives one writer and a nested BEGIN would fail.
 */
export function withTransaction<T>(run: (tx: Tx) => T, tx?: Tx): T {
	if (tx) return run(tx);
	return (database as Db).transaction((inner) => run(inner));
}
