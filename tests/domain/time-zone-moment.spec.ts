import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { momentInZone } from '../../src/lib/domain/time/zone';

function assertProperty(property: fc.IPropertyWithHooks<unknown[]>): void {
	expect(() => fc.assert(property)).not.toThrow();
}

describe('a deadline typed on the wall clock of the workshop (C4)', () => {
	it('reads the time in the zone of the organisation, not of the server', () => {
		expect(momentInZone('2026-10-01', '10:00', 'Europe/Moscow')?.toISOString()).toBe(
			'2026-10-01T07:00:00.000Z'
		);
		expect(momentInZone('2026-10-01', '00:30', 'Asia/Vladivostok')?.toISOString()).toBe(
			'2026-09-30T14:30:00.000Z'
		);
	});

	it('shows the same wall clock again when formatted in that zone', () => {
		const zones = fc.constantFrom('Europe/Moscow', 'Asia/Yekaterinburg', 'Europe/Kaliningrad');
		const days = fc.date({
			min: new Date('2026-01-01'),
			max: new Date('2027-12-31'),
			noInvalidDate: true
		});
		assertProperty(
			fc.property(
				zones,
				days,
				fc.integer({ min: 0, max: 23 }),
				fc.integer({ min: 0, max: 59 }),
				(zone, day, h, m) => {
					const date = day.toISOString().slice(0, 10);
					const clock = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
					const moment = momentInZone(date, clock, zone);
					const wall = new Intl.DateTimeFormat('sv-SE', {
						timeZone: zone,
						dateStyle: 'short',
						timeStyle: 'short'
					}).format(moment ?? new Date(0));
					return wall === `${date} ${clock}`;
				}
			)
		);
	});

	it('refuses a day or a time the calendar does not have', () => {
		expect(momentInZone('2026-02-31', '10:00', 'Europe/Moscow')).toBeNull();
		expect(momentInZone('2026-02-01', '24:00', 'Europe/Moscow')).toBeNull();
		expect(momentInZone('2026-02-01', '9:00', 'Europe/Moscow')).toBeNull();
	});
});
