import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { isFullyLoaded, loadableQty, type LoadedLine } from '../../src/lib/domain/request/loading';

/** vitest runs with requireAssertions, so a property is asserted through expect, not bare. */
function assertProperty(property: fc.IPropertyWithHooks<unknown[]>): void {
	expect(() => fc.assert(property)).not.toThrow();
}

const loadedLine = fc
	.record({ qty: fc.integer({ min: 1, max: 20 }), loaded: fc.integer({ min: 0, max: 25 }) })
	.map(({ qty, loaded }): LoadedLine => ({ qty, loadedQty: loaded }));

describe('guard fullyLoaded (tech.md v1.43)', () => {
	it('lets a counterparty request go only with lines, every one of them on board', () => {
		assertProperty(
			fc.property(fc.array(loadedLine, { maxLength: 8 }), (lines) => {
				const expected = lines.length > 0 && lines.every((line) => line.loadedQty >= line.qty);
				return isFullyLoaded(false, lines) === expected;
			})
		);
	});

	it('lets a stock request go with nothing loaded: its pieces stay on the shelf', () => {
		assertProperty(
			fc.property(fc.array(loadedLine, { maxLength: 8 }), (lines) => isFullyLoaded(true, lines))
		);
	});

	it('holds back a request one piece short', () => {
		expect(
			isFullyLoaded(false, [
				{ qty: 2, loadedQty: 2 },
				{ qty: 3, loadedQty: 2 }
			])
		).toBe(false);
	});
});

describe('pieces one loading may add (tech.md v1.43)', () => {
	it('never exceeds the rest of the line or what the fill holds for it, and never goes negative', () => {
		assertProperty(
			fc.property(loadedLine, fc.integer({ min: -5, max: 25 }), (line, filled) => {
				const pieces = loadableQty(line, filled);
				return (
					pieces >= 0 &&
					pieces <= Math.max(0, line.qty - line.loadedQty) &&
					pieces <= Math.max(0, filled)
				);
			})
		);
	});

	it('offers the whole rest of the line when the shelf holds it', () => {
		expect(loadableQty({ qty: 5, loadedQty: 2 }, 3)).toBe(3);
		expect(loadableQty({ qty: 5, loadedQty: 2 }, 1)).toBe(1);
		expect(loadableQty({ qty: 5, loadedQty: 5 }, 4)).toBe(0);
	});
});
