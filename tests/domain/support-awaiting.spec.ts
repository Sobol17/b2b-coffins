import { describe, expect, it } from 'vitest';
import { awaitingSide } from '../../src/lib/domain/support/awaiting';

describe('awaitingSide (v1.57)', () => {
	it('gives nobody the turn in a closed thread', () => {
		expect(awaitingSide('closed', 'portal')).toBeNull();
		expect(awaitingSide('closed', 'crm')).toBeNull();
	});

	it('gives the turn to the side that did not write last', () => {
		expect(awaitingSide('open', 'portal')).toBe('crm');
		expect(awaitingSide('open', 'crm')).toBe('portal');
	});
});
