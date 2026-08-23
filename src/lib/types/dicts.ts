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
	'purchase'
] as const;
export type StockMoveType = (typeof STOCK_MOVE_TYPES)[number];

export const DOCUMENT_KINDS = [
	'specification',
	'waybill',
	'shop_order',
	'label',
	'payroll_sheet',
	'stock_report',
	'charity_report'
] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

export const JOB_TOPICS = [
	'notification.dispatch',
	'notification.fanout',
	'document.generate',
	'charity.recount',
	'stock.threshold.check',
	'import.bom',
	'import.rates',
	'payroll.calculate',
	'report.export',
	'session.cleanup'
] as const;
export type JobTopic = (typeof JOB_TOPICS)[number];
