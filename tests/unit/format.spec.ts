import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
	PRICE_DASH,
	formatDate,
	formatDateTime,
	formatDayMonth,
	formatMinor,
	parseRublesToMinor,
	pluralRu
} from '../../src/lib/utils/format';

describe('whole rubles on screen and in the money input', () => {
	it('carries a whole-ruble amount to text and back unchanged', () => {
		expect(() =>
			fc.assert(
				fc.property(
					fc.integer({ min: -1e7, max: 1e7 }),
					(rubles) => parseRublesToMinor(formatMinor(rubles * 100)) === rubles * 100
				)
			)
		).not.toThrow();
	});

	it('shows no kopecks and rounds half a ruble up in magnitude', () => {
		expect(formatMinor(125000)).toBe('1\u00a0250');
		expect(formatMinor(66880)).toBe('669');
		expect(formatMinor(66849)).toBe('668');
		expect(formatMinor(-72050)).toBe('-721');
		expect(formatMinor(49)).toBe('0');
		expect(formatMinor(-49)).toBe('0');
	});

	it('never prints a decimal separator for any amount', () => {
		expect(() =>
			fc.assert(
				fc.property(
					fc.integer({ min: -1e11, max: 1e11 }),
					(minor) => !/[,.]/.test(formatMinor(minor))
				)
			)
		).not.toThrow();
	});

	it('reads whole rubles with grouping spaces and refuses kopecks', () => {
		expect(parseRublesToMinor('4 800')).toBe(480000);
		expect(parseRublesToMinor('4\u00a0800')).toBe(480000);
		for (const input of ['', 'abc', '4800,50', '4800.5', '12,345', '1.2.3', '--5', '5 руб']) {
			expect(parseRublesToMinor(input)).toBeNull();
		}
	});

	it('draws a dash instead of a zero when the value is absent', () => {
		expect(formatMinor()).toBe(PRICE_DASH);
		expect(formatMinor(0)).toBe('0');
	});

	it('renders a stored timestamp in the organisation timezone', () => {
		expect(formatDate('2026-08-04T21:30:00Z')).toBe('04.08.2026');
		expect(formatDate('2026-08-04T21:30:00Z', 'Europe/Moscow')).toBe('05.08.2026');
		expect(formatDateTime('2026-08-04T21:30:00Z', 'Europe/Moscow')).toBe('05.08.2026 00:30');
	});

	it('names the day and the month in the organisation timezone', () => {
		expect(formatDayMonth('2026-06-16T09:00:00Z')).toBe('16 июня');
		expect(formatDayMonth('2026-08-31T21:30:00Z', 'Europe/Moscow')).toBe('1 сентября');
	});
});

describe('russian plural forms', () => {
	const forms = ['позиция', 'позиции', 'позиций'] as const;

	it('agrees the noun with the number', () => {
		const cases: [number, string][] = [
			[1, 'позиция'],
			[2, 'позиции'],
			[4, 'позиции'],
			[5, 'позиций'],
			[11, 'позиций'],
			[14, 'позиций'],
			[21, 'позиция'],
			[22, 'позиции'],
			[111, 'позиций'],
			[148, 'позиций'],
			[0, 'позиций']
		];
		for (const [count, word] of cases) expect(pluralRu(count, forms)).toBe(word);
	});

	it('depends only on the last two digits', () => {
		expect(() =>
			fc.assert(
				fc.property(fc.nat({ max: 1e6 }), (n) => pluralRu(n, forms) === pluralRu(n % 100, forms))
			)
		).not.toThrow();
	});
});
