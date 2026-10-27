import { describe, expect, it } from 'vitest';
import { draftDetailsSchema } from '../../src/lib/validation/request';

const form = {
	deliveryAddressId: '1',
	deliveryDate: '2026-10-30',
	deliveryTime: '14:30',
	deceasedName: 'Иванов Иван Иванович',
	comment: ''
};

describe('the delivery deadline of the cart (P11)', () => {
	it('reads the typed time on the wall clock of the workshop, whatever zone the server runs in', () => {
		expect(draftDetailsSchema('Europe/Moscow').parse(form).deliveryAt?.toISOString()).toBe(
			'2026-10-30T11:30:00.000Z'
		);
		expect(draftDetailsSchema('Asia/Irkutsk').parse(form).deliveryAt?.toISOString()).toBe(
			'2026-10-30T06:30:00.000Z'
		);
	});

	it('keeps a half-filled deadline unset, so the send is the step that refuses it', () => {
		const schema = draftDetailsSchema('Europe/Moscow');

		expect(schema.parse({ ...form, deliveryTime: '' }).deliveryAt).toBeNull();
		expect(schema.parse({ ...form, deliveryDate: '' }).deliveryAt).toBeNull();
	});

	it('does not roll a day the calendar does not have over to the next month', () => {
		const parsed = draftDetailsSchema('Europe/Moscow').parse({
			...form,
			deliveryDate: '2026-02-31'
		});

		expect(parsed.deliveryAt).toBeNull();
	});
});
