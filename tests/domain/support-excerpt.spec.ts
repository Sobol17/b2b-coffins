import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { excerpt } from '../../src/lib/domain/support/excerpt';
import { SUPPORT_EXCERPT_MAX } from '../../src/lib/types/support';

const normalized = (s: string) => s.replace(/\s+/g, ' ').trim();
const text = fc.oneof(
	fc.string({ maxLength: 300 }),
	fc
		.array(fc.constantFrom('слово', 'гроб', 'заявка', ' ', '\n', 'а'), { maxLength: 120 })
		.map((parts) => parts.join(' '))
);

describe('excerpt (v1.57)', () => {
	it('fits the limit', () => {
		fc.assert(
			fc.property(text, (s) => {
				expect(excerpt(s).length).toBeLessThanOrEqual(SUPPORT_EXCERPT_MAX);
			})
		);
	});

	it('is the start of the text', () => {
		fc.assert(
			fc.property(text, (s) => {
				expect(normalized(s).startsWith(excerpt(s).replace(/…$/, ''))).toBe(true);
			})
		);
	});

	it('keeps a short text whole', () => {
		fc.assert(
			fc.property(text, (s) => {
				fc.pre(normalized(s).length <= SUPPORT_EXCERPT_MAX);
				expect(excerpt(s)).toBe(normalized(s));
			})
		);
	});

	it('cuts at a word', () => {
		expect(excerpt('слово '.repeat(40))).toMatch(/ слово…$/);
	});
});
