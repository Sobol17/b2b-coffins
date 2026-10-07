import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { clip, failureOf, failureText } from '../../src/lib/domain/notification/delivery';

describe('delivery failure codes and clipping (C15)', () => {
	it('reads back the code it wrote', () => {
		expect(failureOf(failureText('expired', 'gone: 410'))).toBe('expired');
		expect(failureOf(failureText('driver', 'timeout'))).toBe('driver');
	});

	it('reads an old or empty error as no code', () => {
		expect(failureOf(null)).toBeNull();
		expect(failureOf('channel push is not live')).toBeNull();
	});

	it('never returns more than the limit and keeps short text as is', () => {
		fc.assert(
			fc.property(fc.string(), fc.integer({ min: 1, max: 300 }), (text, max) => {
				const clipped = clip(text, max);
				expect([...clipped].length).toBeLessThanOrEqual(max);
				if ([...text].length <= max) expect(clipped).toBe(text);
			})
		);
	});

	it('marks a cut with an ellipsis', () => {
		expect(clip('Ритуальная служба', 8)).toBe('Ритуаль…');
	});
});
