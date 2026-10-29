import { EVENT_KEYS, type EventKey } from '$lib/types/events';

const REQUEST_VARIABLES = ['number', 'status', 'url', 'counterparty', 'externalNumber'] as const;
const STOCK_VARIABLES = ['item', 'code', 'balance', 'threshold', 'unit', 'url'] as const;
const PAYROLL_VARIABLES = ['period', 'url'] as const;
const SHOP_VARIABLES = ['number', 'station', 'priority', 'url'] as const;
const SUPPORT_VARIABLES = [
	'thread',
	'subject',
	'counterparty',
	'author',
	'excerpt',
	'url'
] as const;
// Closing a thread carries no message, so there is nothing to quote.
const SUPPORT_CLOSED_VARIABLES = SUPPORT_VARIABLES.filter((name) => name !== 'excerpt');

export type TemplateValues = Readonly<Record<string, string>>;

type EventGroup = 'request' | 'stock' | 'payroll' | 'support' | 'support_closed' | 'shop';

/** Every event names its group: a new key without one fails the typecheck, not the payroll set. */
const GROUP_OF: Readonly<Record<EventKey, EventGroup>> = {
	'request.submitted': 'request',
	'request.accepted': 'request',
	'request.ready': 'request',
	'request.delivered': 'request',
	'request.cancelled': 'request',
	'request.rejected': 'request',
	'request.payment_marked': 'request',
	'request.paid': 'request',
	'stock.below_threshold': 'stock',
	'payroll.week_closed': 'payroll',
	'support.opened': 'support',
	'support.message_posted': 'support',
	'support.closed': 'support_closed',
	'shop.task_arrived': 'shop'
};

function perEvent<T>(byGroup: Readonly<Record<EventGroup, T>>): Readonly<Record<EventKey, T>> {
	const entries = EVENT_KEYS.map((key): [EventKey, T] => [key, byGroup[GROUP_OF[key]]]);
	return Object.fromEntries(entries) as Record<EventKey, T>;
}

/** Variables a template of the event may use (tech.md 7.3). No money on any of the lists. */
export const EVENT_TEMPLATE_VARIABLES: Readonly<Record<EventKey, readonly string[]>> = perEvent<
	readonly string[]
>({
	request: REQUEST_VARIABLES,
	stock: STOCK_VARIABLES,
	payroll: PAYROLL_VARIABLES,
	support: SUPPORT_VARIABLES,
	support_closed: SUPPORT_CLOSED_VARIABLES,
	shop: SHOP_VARIABLES
});

const PLACEHOLDER = /\{\{\s*([A-Za-z]+)\s*\}\}/g;

/** Placeholders the event does not offer. The seed and the CRM form refuse such a text. */
export function unknownVariables(eventKey: EventKey, text: string): string[] {
	const known = EVENT_TEMPLATE_VARIABLES[eventKey];
	const names = [...text.matchAll(PLACEHOLDER)].map(([, name]) => name ?? '');
	return [...new Set(names.filter((name) => !known.includes(name)))];
}

/**
 * Fills `{{ name }}` placeholders in one pass: a value that itself looks like a placeholder, such
 * as a counterparty's own order number, is printed as is and never expanded.
 * @throws Error on a placeholder outside the variables of the event.
 */
export function renderTemplate(eventKey: EventKey, text: string, values: TemplateValues): string {
	const unknown = unknownVariables(eventKey, text);
	if (unknown.length > 0) throw new Error(`unknown template variables: ${unknown.join(', ')}`);
	return text.replace(PLACEHOLDER, (_, name: string) => values[name] ?? '');
}

const SUPPORT_SAMPLE = {
	thread: '17',
	subject: 'Сроки по заявке 2026-0042',
	counterparty: 'Ритуал-Сервис',
	author: 'Илья Коротков',
	excerpt: 'Подскажите, успеете ли к пятнице?',
	url: 'https://example.ru/crm/support/17'
} as const;

/** What the preview and the test push show in place of live data. */
export const TEMPLATE_SAMPLES: Readonly<Record<EventKey, TemplateValues>> =
	perEvent<TemplateValues>({
		request: {
			number: '2026-0042',
			status: 'Готов к выдаче',
			url: 'https://example.ru/crm/requests/42',
			counterparty: 'Ритуал-Сервис',
			externalNumber: 'РС-118'
		},
		stock: {
			item: 'Ткань обивочная',
			code: 'TK-01',
			balance: '4',
			threshold: '10',
			unit: 'м',
			url: 'https://example.ru/crm/stock/5'
		},
		payroll: {
			period: '05.10.2026 по 11.10.2026',
			url: 'https://example.ru/crm/payroll?week=2026-10-05'
		},
		support: SUPPORT_SAMPLE,
		support_closed: {
			thread: SUPPORT_SAMPLE.thread,
			subject: SUPPORT_SAMPLE.subject,
			counterparty: SUPPORT_SAMPLE.counterparty,
			author: SUPPORT_SAMPLE.author,
			url: SUPPORT_SAMPLE.url
		},
		shop: {
			number: '2026-0042',
			station: 'Столяр',
			priority: 'срочная',
			url: 'https://example.ru/crm/shop/9'
		}
	});
