import type { Db } from '../../src/lib/server/db/client';
import { staff } from '../../src/lib/server/db/schema';

/** Deployment inserts defaults once; operator edits and disabled records remain untouched. */
export function syncPayrollStaff(db: Db): void {
	for (const row of [
		{
			systemKey: 'director-oleg',
			fullName: 'Руководитель Олег',
			position: 'Руководитель',
			payRole: 'director'
		},
		{
			systemKey: 'director-vitaliy',
			fullName: 'Руководитель Виталий',
			position: 'Руководитель',
			payRole: 'director'
		},
		{
			systemKey: 'administrator',
			fullName: 'Администратор',
			position: 'Администратор',
			payRole: 'administrator'
		}
	] as const)
		db.insert(staff).values(row).onConflictDoNothing({ target: staff.systemKey }).run();
}
