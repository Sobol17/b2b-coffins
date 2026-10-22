import { describe, expect, it } from 'vitest';
import { eventPath } from '../../src/lib/domain/notification/link';

describe('where an event leads (tech.md 7.3)', () => {
	it('opens a request in the contour of the reader', () => {
		expect(eventPath('request.ready', 42, 'portal')).toBe('/portal/requests/42');
		expect(eventPath('request.ready', 42, 'crm_registry')).toBe('/crm/requests/42');
		expect(eventPath('request.ready', 42, 'crm_floor')).toBe('/crm/delivery');
	});

	it('opens the stock item and the payroll week', () => {
		expect(eventPath('stock.below_threshold', 5, 'crm_registry')).toBe('/crm/stock/5');
		expect(eventPath('payroll.week_closed', 9, 'crm_registry', '2026-10-05')).toBe(
			'/crm/payroll?week=2026-10-05'
		);
		expect(eventPath('payroll.week_closed', 9, 'crm_registry')).toBe('/crm/payroll');
	});

	it('opens the support thread in the contour of the reader (v1.57)', () => {
		expect(eventPath('support.message_posted', 17, 'portal')).toBe('/portal/support/17');
		expect(eventPath('support.opened', 17, 'crm_registry')).toBe('/crm/support/17');
		expect(eventPath('support.closed', 17, 'crm_floor')).toBe('/crm/support/17');
	});
});
