import type { Db } from '../../src/lib/server/db/client';
import { financeEntries } from '../../src/lib/server/db/schema';
import { FinanceEntryService } from '../../src/lib/server/finance/finance-entry.service';
import { OrgService } from '../../src/lib/server/settings/org.service';
import { isoDay } from '../../src/lib/utils/format';
import { actorContext } from '../admin/request';
import { DEMO_PEOPLE } from './demo-scenarios';
import { addDays } from '../../src/lib/domain/payroll/calc';
import type { ActorContext } from '../../src/lib/types/actor';
import type { FinanceKind } from '../../src/lib/types/finance';

interface DemoEntry {
	readonly kind: FinanceKind;
	readonly amountMinor: number;
	/** Days before today; clamped to the first of the month so the default period shows every row. */
	readonly daysAgo: number | 'month_start';
	readonly comment: string;
}

const DEMO_FINANCE: readonly DemoEntry[] = [
	{ kind: 'expense', amountMinor: 4_500_000, daysAgo: 'month_start', comment: 'Аренда цеха' },
	{ kind: 'expense', amountMinor: 1_850_000, daysAgo: 5, comment: 'Доски, сосна' },
	{ kind: 'expense', amountMinor: 320_000, daysAgo: 1, comment: 'Бензин на доставку' },
	{ kind: 'income', amountMinor: 200_000, daysAgo: 2, comment: 'Продажа обрезков' }
];

/**
 * Manual entries of the finance page (v1.58), written through the service so the journal gets them
 * too. bookFinanceOnce is the guard; call this directly only on an empty table.
 * @returns how many entries were written.
 */
export function seedDemoFinance(owner: ActorContext, today: string): number {
	const monthStart = `${today.slice(0, 7)}-01`;
	const service = new FinanceEntryService(owner);
	for (const entry of DEMO_FINANCE) {
		const day = entry.daysAgo === 'month_start' ? monthStart : addDays(today, -entry.daysAgo);
		service.create({
			kind: entry.kind,
			amountMinor: entry.amountMinor,
			occurredOn: day < monthStart ? monthStart : day,
			comment: entry.comment
		});
	}
	return DEMO_FINANCE.length;
}

/**
 * Books the demo entries when the table is empty, whatever the requests guard says: a stand seeded
 * before the finance page still gets a page that is not empty.
 * @returns how many entries were written, 0 when the table already had rows.
 */
export function bookFinanceOnce(db: Db): number {
	if (db.select({ id: financeEntries.id }).from(financeEntries).limit(1).all().length > 0) return 0;
	const today = isoDay(new Date().toISOString(), OrgService.timezone());
	return seedDemoFinance(actorContext(db, DEMO_PEOPLE.owner), today);
}
