import { describe, expect, it } from 'vitest';
import { buildWorkMatrix } from '../../src/lib/crm/payroll/work-matrix';
import type { WorkTypeDto } from '../../src/lib/types/crm-payroll';

const variants = [
	{ id: 10, label: 'SKU-180 · Ёлка · 180' },
	{ id: 20, label: 'SKU-200 · Прямой · 200' }
];
const works: WorkTypeDto[] = [
	{
		id: 1,
		title: 'Столяр 180',
		variantId: 10,
		roleCode: 'carpenter',
		rateMinor: 0,
		isActive: true
	},
	{
		id: 2,
		title: 'Покраска 180',
		variantId: 10,
		roleCode: 'painter',
		rateMinor: 25000,
		isActive: false
	},
	{
		id: 3,
		title: 'Дополнительная обработка',
		roleCode: 'grinder',
		rateMinor: 5000,
		isActive: true
	},
	{
		id: 4,
		title: 'Старая позиция',
		variantId: 30,
		variantLabel: 'OLD · Архив · 190',
		roleCode: 'upholsterer',
		rateMinor: 10000,
		isActive: true
	}
];

describe('payroll position rate matrix', () => {
	it('keeps zero and disabled rates distinct from missing roles and shows positions without rates', () => {
		const result = buildWorkMatrix(works, variants);
		expect(result.positions.map((row) => row.id)).toEqual([10, 20, 30]);
		expect(result.positions[0]?.rates.carpenter).toMatchObject({
			id: 1,
			rateMinor: 0,
			isActive: true
		});
		expect(result.positions[0]?.rates.painter).toMatchObject({
			id: 2,
			rateMinor: 25000,
			isActive: false
		});
		expect(result.positions[0]?.rates.grinder).toBeNull();
		expect(result.positions[1]?.rates.upholsterer).toBeNull();
	});

	it('separates unlinked manual work and preserves linked positions absent from the choices', () => {
		const result = buildWorkMatrix(works, variants);
		expect(result.manual.map((work) => work.id)).toEqual([3]);
		expect(result.positions[2]).toMatchObject({
			id: 30,
			label: 'OLD · Архив · 190',
			available: false
		});
	});

	it.each(['sku-180', 'елка', '180', 'ЕЛКА 180'])(
		'finds a position by SKU, title or size: %s',
		(query) => {
			expect(buildWorkMatrix(works, variants, query).positions.map((row) => row.id)).toEqual([10]);
		}
	);

	it('filters manual work separately and ignores surrounding whitespace', () => {
		const result = buildWorkMatrix(works, variants, '  дополнительная   обработка ');
		expect(result.manual.map((work) => work.id)).toEqual([3]);
		expect(result.positions).toEqual([]);
	});
});
