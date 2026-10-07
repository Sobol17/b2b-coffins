import type { FunnelStage, LostStatus, SalesBucket, SalesGroup } from '$lib/types/crm-reports';
import { PRICE_DASH } from '$lib/utils/format';

export const FUNNEL_STAGE_TITLE: Readonly<Record<FunnelStage, string>> = {
	new: 'Отправлено',
	in_work: 'Принято в работу',
	ready: 'Готово',
	delivered: 'Доставлено',
	paid: 'Оплачено'
};
export const LOST_STATUS_TITLE: Readonly<Record<LostStatus, string>> = {
	cancelled: 'Отменена',
	rejected: 'Отклонена'
};
export const SALES_GROUP_TITLE: Readonly<Record<SalesGroup, string>> = {
	counterparty: 'По контрагентам',
	model: 'По моделям',
	period: 'По периодам'
};
export const SALES_BUCKET_TITLE: Readonly<Record<SalesBucket, string>> = {
	day: 'По дням',
	week: 'По неделям',
	month: 'По месяцам'
};

/** Basis points as a percent with one decimal: a funnel of ten requests needs it. */
export function percentOfBp(bp: number | null): string {
	return bp === null
		? PRICE_DASH
		: `${(bp / 100).toLocaleString('ru-RU', { maximumFractionDigits: 1 })} %`;
}

export function daysOrDash(days: number | null): string {
	return days === null ? PRICE_DASH : String(days);
}
