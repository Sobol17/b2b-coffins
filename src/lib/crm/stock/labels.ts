import type { StockKind } from '$lib/types/crm-stock';
import type { StockMoveType } from '$lib/types/dicts';

export const KIND_TITLE: Readonly<Record<StockKind, string>> = {
	product: 'Изделие',
	component: 'Комплектующее'
};

export const KIND_PLURAL: Readonly<Record<StockKind, string>> = {
	product: 'Изделия',
	component: 'Комплектующие'
};

export const KIND_OPTIONS = (['component', 'product'] as const).map((value) => ({
	value,
	label: KIND_PLURAL[value]
}));

export const MOVE_TYPE_TITLE: Readonly<Record<StockMoveType, string>> = {
	production: 'Выпуск',
	shipment: 'Погрузка',
	adjustment: 'Корректировка',
	inventory: 'Инвентаризация',
	reversal: 'Сторно',
	purchase: 'Приход'
};

export const INVENTORY_STATUS_TITLE = { draft: 'Черновик', applied: 'Проведена' } as const;

/** A balance with its sign: the journal reads as income and outcome at a glance. */
export function signed(qty: number): string {
	return qty > 0 ? `+${qty}` : String(qty);
}
