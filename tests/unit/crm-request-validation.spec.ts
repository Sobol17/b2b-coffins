import { describe, expect, it } from 'vitest';
import {
	MAX_CREATE_LINES,
	boardMoveSchema,
	crmRequestCreateForm,
	crmRequestCreateSchema,
	crmRequestFiltersSchema
} from '../../src/lib/validation/crm-request';

function form(entries: [string, string][]): FormData {
	const data = new FormData();
	for (const [key, value] of entries) data.append(key, value);
	return data;
}

const delivery: [string, string][] = [
	['counterpartyId', '1'],
	['deliveryAddressId', '2'],
	['deliveryDate', '2026-10-01'],
	['deliveryTime', '10:00'],
	['deceasedName', 'Иванов Иван Иванович']
];

describe('filters of the board and the registry (C4)', () => {
	it('reads a counterparty id or the stock switch from one field', () => {
		expect(crmRequestFiltersSchema.parse({ counterparty: '7' })).toMatchObject({
			counterpartyId: 7,
			stockOnly: undefined
		});
		expect(crmRequestFiltersSchema.parse({ counterparty: 'stock' })).toMatchObject({
			counterpartyId: undefined,
			stockOnly: true
		});
	});

	it('drops a tampered value instead of failing the page', () => {
		const parsed = crmRequestFiltersSchema.parse({
			status: 'lost',
			flag: 'drop table',
			priority: 'high',
			from: '01.10.2026',
			counterparty: '-1'
		});
		expect(parsed).toEqual({
			status: undefined,
			flag: undefined,
			priority: undefined,
			from: undefined,
			to: undefined,
			counterpartyId: undefined,
			stockOnly: undefined
		});
	});
});

describe('the creation form of the workshop (C4)', () => {
	it('keeps index-aligned lines together, an empty colour included', () => {
		const raw = crmRequestCreateForm(
			form([
				['kind', 'counterparty'],
				...delivery,
				['variantId', '3'],
				['optionId', ''],
				['qty', '2'],
				['variantId', '4'],
				['optionId', '9'],
				['qty', '1']
			])
		);
		const parsed = crmRequestCreateSchema.parse(raw);
		expect(parsed.lines).toEqual([
			{ variantId: 3, optionId: null, qty: 2 },
			{ variantId: 4, optionId: 9, qty: 1 }
		]);
		expect(parsed.priority).toBe('normal');
	});

	it('asks a counterparty request for every delivery field', () => {
		const result = crmRequestCreateSchema.safeParse(
			crmRequestCreateForm(
				form([
					['kind', 'counterparty'],
					['variantId', '3'],
					['qty', '1']
				])
			)
		);
		expect(result.success).toBe(false);
		const paths = result.error?.issues.map((issue) => issue.path.join('.')) ?? [];
		expect(paths).toEqual(
			expect.arrayContaining([
				'counterpartyId',
				'deliveryAddressId',
				'deliveryDate',
				'deliveryTime',
				'deceasedName'
			])
		);
	});

	it('lets a stock request go without a counterparty and a delivery', () => {
		const parsed = crmRequestCreateSchema.parse(
			crmRequestCreateForm(
				form([
					['kind', 'stock'],
					['variantId', '3'],
					['qty', '5']
				])
			)
		);
		expect(parsed).toMatchObject({ kind: 'stock', counterpartyId: null, deceasedName: null });
	});

	it('refuses an empty order, a zero quantity and an overlong list', () => {
		const base: [string, string][] = [['kind', 'stock']];
		expect(crmRequestCreateSchema.safeParse(crmRequestCreateForm(form(base))).success).toBe(false);
		const zero = form([...base, ['variantId', '3'], ['qty', '0']]);
		expect(crmRequestCreateSchema.safeParse(crmRequestCreateForm(zero)).success).toBe(false);
		const many = form([
			...base,
			...Array.from({ length: MAX_CREATE_LINES + 1 }, (): [string, string][] => [
				['variantId', '3'],
				['qty', '1']
			]).flat()
		]);
		expect(crmRequestCreateSchema.safeParse(crmRequestCreateForm(many)).success).toBe(false);
	});
});

describe('a card dropped on the board (C4)', () => {
	it('needs the request and a known status', () => {
		expect(boardMoveSchema.parse({ id: '5', to: 'in_work' })).toMatchObject({
			id: 5,
			to: 'in_work'
		});
		expect(boardMoveSchema.safeParse({ id: '5', to: 'archived' }).success).toBe(false);
		expect(boardMoveSchema.safeParse({ to: 'ready' }).success).toBe(false);
	});
});
