export const DICT_CODES = [
	'material',
	'finish',
	'fabric',
	'hardware',
	'unit',
	'work_type',
	'refusal_reason',
	'stock_move_reason',
	'transport'
] as const;
export type DictCode = (typeof DICT_CODES)[number];

export const STOCK_MOVE_TYPES = [
	'production',
	'shipment',
	'adjustment',
	'inventory',
	'reversal',
	'purchase',
	// Components written off by a production mark (tech.md v1.46).
	'consumption'
] as const;
export type StockMoveType = (typeof STOCK_MOVE_TYPES)[number];

export const JOB_TOPICS = [
	'notification.dispatch',
	'notification.fanout',
	'charity.recount',
	'stock.threshold.check',
	'import.bom',
	'import.rates',
	'payroll.calculate',
	'report.export',
	'session.cleanup'
] as const;
export type JobTopic = (typeof JOB_TOPICS)[number];
