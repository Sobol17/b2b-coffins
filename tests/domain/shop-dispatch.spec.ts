import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
	isMadeByShop,
	planDispatch,
	type DispatchLine,
	type DispatchStep,
	type OpenJob
} from '../../src/lib/domain/shop/dispatch';
import { WORK_ROLES } from '../../src/lib/types/roles';

function lineOf(overrides: Partial<DispatchLine> = {}): DispatchLine {
	return { itemId: 1, requestId: 10, wantQty: 3, filledQty: 0, ...overrides };
}

function jobOf(overrides: Partial<OpenJob> & Pick<OpenJob, 'id'>): OpenJob {
	return { itemId: 1, station: 'carpenter', qty: 1, doneQty: 0, ...overrides };
}

/** What the services do with a plan: an add lands on the carpenter, a shrink sets the new qty. */
function apply(jobs: readonly OpenJob[], steps: readonly DispatchStep[]): OpenJob[] {
	let next = 1000;
	const result = jobs.map((job) => ({ ...job }));
	for (const step of steps) {
		if (step.kind === 'add') {
			const open = result.find((job) => job.itemId === step.itemId && job.station === 'carpenter');
			if (open) open.qty += step.qty;
			else result.push(jobOf({ id: next++, itemId: step.itemId, qty: step.qty }));
		} else {
			const job = result.find((row) => row.id === step.jobId);
			if (job) job.qty = step.qty;
		}
	}
	return result.filter((job) => job.qty > 0);
}

function inShop(jobs: readonly OpenJob[], itemId: number): number {
	return jobs.filter((job) => job.itemId === itemId).reduce((sum, job) => sum + job.qty, 0);
}

describe('dispatch of the missing pieces (tech.md §20.4)', () => {
	it('sends the carpenter what the shelf does not cover', () => {
		expect(planDispatch([lineOf({ filledQty: 1 })], [])).toEqual([
			{ kind: 'add', itemId: 1, requestId: 10, qty: 2 }
		]);
	});

	it('sends nothing while the shop already makes the missing pieces', () => {
		expect(planDispatch([lineOf({ filledQty: 1 })], [jobOf({ id: 5, qty: 2 })])).toEqual([]);
	});

	it('takes the extra pieces back from the undone part of the carpenter job', () => {
		expect(
			planDispatch([lineOf({ filledQty: 3 })], [jobOf({ id: 5, qty: 2, doneQty: 1 })])
		).toEqual([{ kind: 'shrink', jobId: 5, qty: 1 }]);
	});

	it('removes a carpenter job with nothing done once the shelf covers the line', () => {
		expect(planDispatch([lineOf({ filledQty: 3 })], [jobOf({ id: 5, qty: 2 })])).toEqual([
			{ kind: 'shrink', jobId: 5, qty: 0 }
		]);
	});

	it('never takes pieces back from a station past the carpenter', () => {
		expect(
			planDispatch([lineOf({ filledQty: 3 })], [jobOf({ id: 5, qty: 2, station: 'painter' })])
		).toEqual([]);
	});

	it('ignores jobs of lines it was not given', () => {
		expect(planDispatch([], [jobOf({ id: 5, qty: 2 })])).toEqual([]);
	});

	it('is done after one plan, never shrinks below the done pieces and covers the gap', () => {
		const job = fc.record({
			itemId: fc.integer({ min: 1, max: 3 }),
			station: fc.constantFrom(...WORK_ROLES),
			qty: fc.integer({ min: 1, max: 5 }),
			done: fc.integer({ min: 0, max: 5 })
		});
		const line = fc.record({
			want: fc.integer({ min: 0, max: 8 }),
			filled: fc.integer({ min: 0, max: 8 })
		});
		const input = fc.record({
			lines: fc.tuple(line, line, line),
			jobs: fc.uniqueArray(job, { selector: (row) => `${row.itemId}:${row.station}`, maxLength: 8 })
		});
		expect(() =>
			fc.assert(
				fc.property(input, ({ lines: raw, jobs: rawJobs }) => {
					const lines = raw.map((row, index): DispatchLine => ({
						itemId: index + 1,
						requestId: 10,
						wantQty: row.want,
						filledQty: Math.min(row.filled, row.want)
					}));
					const jobs = rawJobs.map((row, index) =>
						jobOf({
							id: index + 1,
							itemId: row.itemId,
							station: row.station,
							qty: row.qty,
							doneQty: Math.min(row.done, row.qty)
						})
					);
					const steps = planDispatch(lines, jobs);
					const after = apply(jobs, steps);
					const safe = steps.every(
						(step) =>
							step.kind === 'add' ||
							step.qty >= (jobs.find((row) => row.id === step.jobId)?.doneQty ?? 0)
					);
					const covered = lines.every(
						(row) => inShop(after, row.itemId) >= row.wantQty - row.filledQty
					);
					return safe && covered && planDispatch(lines, after).length === 0;
				})
			)
		).not.toThrow();
	});
});

describe('readiness of a stock request (tech.md §6.2)', () => {
	it('is made once every line has its pieces past the upholsterer', () => {
		expect(isMadeByShop([])).toBe(false);
		expect(isMadeByShop([{ qty: 2, madeQty: 2 }])).toBe(true);
		expect(
			isMadeByShop([
				{ qty: 2, madeQty: 2 },
				{ qty: 1, madeQty: 0 }
			])
		).toBe(false);
	});
});
