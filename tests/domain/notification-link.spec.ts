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
});
