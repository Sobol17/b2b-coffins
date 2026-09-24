import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
	nextNumber,
	resumeSequence,
	type SequenceState
} from '../../src/lib/domain/numbering/numbering';
import { NUMBERING_PERIODS } from '../../src/lib/types/crm';

const TZ = 'Europe/Moscow';
const prefixArb = fc.constantFrom('', 'З-', 'З', 'ЗК-', 'A/', 'З-2026-');
const periodArb = fc.constantFrom(...NUMBERING_PERIODS);
// Moments across two years, so month and year periods both roll over inside a run.
const momentArb = fc
	.integer({ min: Date.UTC(2025, 0, 1), max: Date.UTC(2026, 11, 31) })
	.map((ms) => new Date(ms));

/** Issues `count` numbers under one configuration, the way the app would before a change. */
function issue(
	settings: { prefix: string; period: SequenceState['period'] },
	at: Date,
	count: number
): string[] {
	let state: SequenceState = { ...settings, periodKey: '', lastValue: 0 };
	const numbers: string[] = [];
	for (let i = 0; i < count; i += 1) {
		const next = nextNumber(state, at, TZ);
		numbers.push(next.number);
		state = { ...state, periodKey: next.periodKey, lastValue: next.value };
	}
	return numbers;
}

describe('numbering after the owner changes prefix or period', () => {
	it('never hands out a number that was already issued under any earlier configuration', () => {
		fc.assert(
			fc.property(
				fc.array(
					fc.record({
						prefix: prefixArb,
						period: periodArb,
						at: momentArb,
						count: fc.integer({ min: 0, max: 30 })
					}),
					{ maxLength: 6 }
				),
				prefixArb,
				periodArb,
				momentArb,
				(history, prefix, period, now) => {
					const issued = history.flatMap((step) => issue(step, step.at, step.count));
					const state = resumeSequence({ prefix, period }, issued, now, TZ);
					expect(issued).not.toContain(nextNumber(state, now, TZ).number);
				}
			)
		);
	});

	it('starts from one when no number of the new form exists', () => {
		fc.assert(
			fc.property(prefixArb, periodArb, momentArb, (prefix, period, now) => {
				const state = resumeSequence({ prefix, period }, [], now, TZ);
				expect(state.lastValue).toBe(0);
				expect(nextNumber(state, now, TZ).value).toBe(1);
			})
		);
	});

	it('continues right after the highest number of the same form', () => {
		const now = new Date(Date.UTC(2026, 8, 24));
		const issued = ['З-2026-00007', 'З-2026-00012', 'З-2026-09-00040', 'ЗК-2026-00099', 'З-00500'];
		const state = resumeSequence({ prefix: 'З-', period: 'year' }, issued, now, TZ);
		expect(nextNumber(state, now, TZ).number).toBe('З-2026-00013');
	});

	it('keeps the prefix and the period the owner chose', () => {
		fc.assert(
			fc.property(prefixArb, periodArb, momentArb, (prefix, period, now) => {
				const state = resumeSequence({ prefix, period }, [], now, TZ);
				expect(state.prefix).toBe(prefix);
				expect(state.period).toBe(period);
				expect(nextNumber(state, now, TZ).number.startsWith(prefix)).toBe(true);
			})
		);
	});
});
