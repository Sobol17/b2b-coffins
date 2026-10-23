import { FinanceEntryService } from '../../src/lib/server/finance/finance-entry.service';
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
 * too. The caller runs this once per demo seed; the guard of seedDemo keeps a second run out.
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
