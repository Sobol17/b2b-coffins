import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
	ACTIVE_STATUSES,
	CLOSED_STATUSES,
	dateWindow,
	sortFor
} from '../../src/lib/domain/request/registry';
import { REQUEST_STATUSES } from '../../src/lib/types/request';

const MOSCOW = 'Europe/Moscow';

describe('portal request registry (P6)', () => {
	it('splits every sent status into the active part and the closed part', () => {
		const covered = [...ACTIVE_STATUSES, ...CLOSED_STATUSES].sort();
		const sent = REQUEST_STATUSES.filter((status) => status !== 'draft').sort();

		expect(covered).toEqual([...sent]);
	});

	it('sorts by the newest first when the query names no sort', () => {
		expect(sortFor(undefined, true)).toBe('submittedAt');
	});

	it('ignores a sort the contract does not list', () => {
		expect(sortFor('costPriceMinor', true)).toBe('submittedAt');
	});

	it('keeps the money sort away from a role without prices', () => {
		expect(sortFor('total', true)).toBe('total');
		expect(sortFor('total', false)).toBe('submittedAt');
	});

	it('opens the window at the first moment of the day in the organisation timezone', () => {
		const window = dateWindow({ from: '2026-09-01' }, MOSCOW);

		expect(window.from?.toISOString()).toBe('2026-08-31T21:00:00.000Z');
		expect(window.to).toBeUndefined();
	});

	it('closes the window at the end of the last day, so that day stays in the result', () => {
		const window = dateWindow({ to: '2026-09-30' }, MOSCOW);

		expect(window.to?.toISOString()).toBe('2026-09-30T20:59:59.999Z');
	});

	it('drops a date the calendar does not have', () => {
		expect(dateWindow({ from: '2026-02-31', to: 'вчера' }, MOSCOW)).toEqual({});
	});

	it('never opens a window that ends before it starts', () => {
		const day = fc.date({ min: new Date('2020-01-01'), max: new Date('2030-01-01') });
		const property = fc.property(day, day, (left, right) => {
			const [from, to] = [left, right].map((at) => at.toISOString().slice(0, 10)).sort();
			const window = dateWindow({ from, to }, MOSCOW);
			return (window.from?.getTime() ?? 0) <= (window.to?.getTime() ?? 0);
		});

		expect(() => fc.assert(property)).not.toThrow();
	});
});
