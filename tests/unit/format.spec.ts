import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
	PRICE_DASH,
	formatDate,
	formatDateTime,
	formatMinor,
	parseRublesToMinor
} from '../../src/lib/utils/format';

describe('rubles and kopecks in the money input', () => {
	it('carries an amount to rubles and back without losing a kopeck', () => {
		expect(() =>
			fc.assert(
				fc.property(
					fc.integer({ min: -1e9, max: 1e9 }),
					(minor) => parseRublesToMinor(formatMinor(minor)) === minor
				)
			)
		).not.toThrow();
	});

	it('never produces a fractional kopeck from typed text', () => {
		expect(() =>
			fc.assert(
				fc.property(
					fc.integer({ min: -1e7, max: 1e7 }),
					fc.integer({ min: 0, max: 99 }),
					(rubles, kopecks) => {
						const parsed = parseRublesToMinor(`${rubles},${String(kopecks).padStart(2, '0')}`);
						return parsed !== null && Number.isInteger(parsed);
					}
				)
			)
		).not.toThrow();
	});

	it('rejects text that is not an amount', () => {
		for (const input of ['', 'abc', '12,345', '1.2.3', '--5', '5 руб']) {
			expect(parseRublesToMinor(input)).toBeNull();
		}
	});

	it('draws a dash instead of a zero when the value is absent', () => {
		expect(formatMinor()).toBe(PRICE_DASH);
		expect(formatMinor(125000)).toBe('1 250,00');
	});

	it('renders a stored timestamp in the organisation timezone', () => {
		expect(formatDate('2026-08-04T21:30:00Z')).toBe('04.08.2026');
		expect(formatDate('2026-08-04T21:30:00Z', 'Europe/Moscow')).toBe('05.08.2026');
		expect(formatDateTime('2026-08-04T21:30:00Z', 'Europe/Moscow')).toBe('05.08.2026 00:30');
	});
});
