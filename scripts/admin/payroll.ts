import type { Db } from '../../src/lib/server/db/client';
import { WorkEntryCrewRepository } from '../../src/lib/server/crm-payroll/work-entry-crew.repository';

/**
 * Gives the work entries written before tech.md v1.55 a crew: everyone present that day, which
 * is how the old rule split them. Run once after the deploy; a second run changes nothing.
 */
export function payrollBackfillCrews(db: Db): void {
	const filled = db.transaction((tx) => new WorkEntryCrewRepository().backfill(tx));
	console.log(JSON.stringify({ filled }));
}
