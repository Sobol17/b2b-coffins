import { EVENT_KEYS, REQUEST_EVENT_KEYS, type EventKey } from '$lib/types/events';

const REQUEST_VARIABLES = ['number', 'status', 'url', 'counterparty', 'externalNumber'] as const;
const STOCK_VARIABLES = ['item', 'code', 'balance', 'threshold', 'unit', 'url'] as const;
const PAYROLL_VARIABLES = ['period', 'url'] as const;

export type TemplateValues = Readonly<Record<string, string>>;

/** One entry per event: every request event shares a set, stock and payroll bring their own. */
function perEvent<T>(request: T, stock: T, payroll: T): Readonly<Record<EventKey, T>> {
	const entries = EVENT_KEYS.map((key): [EventKey, T] => {
		if (REQUEST_EVENT_KEYS.includes(key)) return [key, request];
		return [key, key === 'stock.below_threshold' ? stock : payroll];
	});
	return Object.fromEntries(entries) as Record<EventKey, T>;
}

/** Variables a template of the event may use (tech.md 7.3). No money on any of the lists. */
export const EVENT_TEMPLATE_VARIABLES: Readonly<Record<EventKey, readonly string[]>> = perEvent<
	readonly string[]
>(REQUEST_VARIABLES, STOCK_VARIABLES, PAYROLL_VARIABLES);

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

/** What the preview and the test push show in place of live data. */
export const TEMPLATE_SAMPLES: Readonly<Record<EventKey, TemplateValues>> =
	perEvent<TemplateValues>(
		{
			number: '2026-0042',
			status: 'Готов к выдаче',
			url: 'https://example.ru/crm/requests/42',
			counterparty: 'Ритуал-Сервис',
			externalNumber: 'РС-118'
		},
		{
			item: 'Ткань обивочная',
			code: 'TK-01',
			balance: '4',
			threshold: '10',
			unit: 'м',
			url: 'https://example.ru/crm/stock/5'
		},
		{
			period: '05.10.2026 по 11.10.2026',
			url: 'https://example.ru/crm/payroll?week=2026-10-05'
		}
	);
