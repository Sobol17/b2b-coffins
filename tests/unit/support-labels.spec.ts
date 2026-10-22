import { describe, expect, it } from 'vitest';
import { supportState } from '../../src/lib/support/labels';

describe('support thread state for each contour (v1.57)', () => {
	it('shows the workshop its own turn as the one to act on', () => {
		expect(supportState({ status: 'open', awaiting: 'crm' }, 'crm').label).toBe('Ждёт ответа');
		expect(supportState({ status: 'open', awaiting: 'portal' }, 'crm').label).toBe('Ответили');
	});

	it('tells the counterparty whether the workshop answered', () => {
		expect(supportState({ status: 'open', awaiting: 'crm' }, 'portal').label).toBe(
			'Ждёт ответа мастерской'
		);
		expect(supportState({ status: 'open', awaiting: 'portal' }, 'portal').label).toBe('Есть ответ');
	});

	it('names a closed thread the same on both sides', () => {
		expect(supportState({ status: 'closed', awaiting: null }, 'crm').label).toBe('Закрыто');
		expect(supportState({ status: 'closed', awaiting: null }, 'portal').label).toBe('Закрыто');
	});
});
