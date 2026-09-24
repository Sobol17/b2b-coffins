import { describe, expect, it } from 'vitest';
import { changeLines } from '../../src/lib/crm/audit/changes';

describe('changes column of the audit journal', () => {
	it('pairs the old and the new value of every key', () => {
		expect(changeLines({ 'charity.rate_bp': 100 }, { 'charity.rate_bp': 150 })).toEqual([
			{ key: 'charity.rate_bp', before: '100', after: '150' }
		]);
	});

	it('shows a key that only appeared or only vanished', () => {
		expect(changeLines(null, { roles: ['manager'] })).toEqual([
			{ key: 'roles', before: null, after: '["manager"]' }
		]);
		expect(changeLines({ isActive: true }, null)).toEqual([
			{ key: 'isActive', before: 'true', after: null }
		]);
	});

	it('leaves out a key whose value did not move', () => {
		expect(changeLines({ title: 'Дуб', sortOrder: 5 }, { title: 'Дуб', sortOrder: 10 })).toEqual([
			{ key: 'sortOrder', before: '5', after: '10' }
		]);
	});

	it('cuts a long value so one entry does not stretch the table', () => {
		const [line] = changeLines(null, { note: 'а'.repeat(200) });
		expect(line?.after).toHaveLength(80);
		expect(line?.after?.endsWith('…')).toBe(true);
	});
});
