import type { FeedRow } from './finance-feed.repository';
import { kindOf } from '$lib/domain/finance/summary';
import { PAYMENT_METHOD_TITLE } from '$lib/crm/labels';
import type { FinanceOperationDto } from '$lib/types/finance';
import { formatDate, isoDay } from '$lib/utils/format';

const dayMonth = (at: Date, timeZone: string): string =>
	formatDate(at.toISOString(), timeZone).slice(0, 5);

function describe(
	row: FeedRow,
	timeZone: string
): Pick<FinanceOperationDto, 'title' | 'detail' | 'href'> {
	switch (row.source) {
		case 'order_payment': {
			const method = row.method === null ? '' : PAYMENT_METHOD_TITLE[row.method];
			return {
				title: `Заявка №${row.requestNumber ?? ''}`,
				detail: row.isReversal ? `Сторно оплаты, ${method.toLowerCase()}` : method,
				href: `/crm/requests/${row.requestId ?? ''}`
			};
		}
		case 'payroll': {
			const week =
				row.weekStartsAt && row.weekEndsAt
					? `неделя ${dayMonth(row.weekStartsAt, timeZone)}–${dayMonth(row.weekEndsAt, timeZone)}`
					: null;
			const start = row.weekStartsAt ? isoDay(row.weekStartsAt.toISOString(), timeZone) : '';
			return {
				title: `Выплата: ${row.staffName ?? ''}`,
				detail: week,
				href: `/crm/payroll?week=${start}`
			};
		}
		case 'charity':
			return {
				title: 'Перечисление в фонд',
				detail: row.isReversal ? 'Сторно перечисления' : row.documentRef,
				href: '/crm/reports/charity'
			};
		case 'manual_income':
		case 'manual_expense':
			return { title: row.comment ?? '', detail: null, href: null };
	}
}

/** A feed row as the page and the sheet show it; only a manual line carries an id to edit. */
export function toOperationDto(row: FeedRow, timeZone: string): FinanceOperationDto {
	const manual = row.source === 'manual_income' || row.source === 'manual_expense';
	return {
		key: `${row.source}:${row.id}`,
		source: row.source,
		kind: kindOf(row.source),
		occurredOn: isoDay(row.occurredAt.toISOString(), timeZone),
		signedMinor: row.signedMinor,
		...describe(row, timeZone),
		manualId: manual ? row.id : null
	};
}
