import { describe, expect, it } from 'vitest';
import { navigationUrl } from '../../src/lib/utils/navigation';
import {
	deliveryDoneSchema,
	deliveryLoadSchema,
	deliveryUnloadSchema
} from '../../src/lib/validation/crm-delivery';

describe('navigation link of a stop (C6)', () => {
	it('routes to the pin when the address has one', () => {
		expect(navigationUrl({ address: 'Москва, Полевая, 12', lat: 55.75, lon: 37.61 })).toBe(
			'https://yandex.ru/maps/?rtext=~55.75,37.61&rtt=auto'
		);
	});

	it('searches the address text without a pin, escaped for the URL', () => {
		expect(navigationUrl({ address: 'Москва, Полевая 12 & 14', lat: null, lon: null })).toBe(
			`https://yandex.ru/maps/?text=${encodeURIComponent('Москва, Полевая 12 & 14')}`
		);
	});

	it('ignores a pin off the globe and gives nothing without any address', () => {
		expect(navigationUrl({ address: 'Балашиха', lat: 120, lon: 37 })).toBe(
			'https://yandex.ru/maps/?text=%D0%91%D0%B0%D0%BB%D0%B0%D1%88%D0%B8%D1%85%D0%B0'
		);
		expect(navigationUrl({ address: '  ', lat: null, lon: null })).toBeNull();
		expect(navigationUrl({ address: null, lat: 55, lon: null })).toBeNull();
	});
});

describe('input of the delivery screen (C6)', () => {
	it('takes a loading of whole pieces within the limit of one mark', () => {
		expect(deliveryLoadSchema.parse({ itemId: '4', qty: '2' })).toEqual({ itemId: 4, qty: 2 });
		for (const qty of ['0', '1.5', '1000', 'много']) {
			expect(deliveryLoadSchema.safeParse({ itemId: '4', qty }).success).toBe(false);
		}
	});

	it('reads the cash checkbox as the form sends it', () => {
		expect(deliveryDoneSchema.parse({ requestId: '7', cashCollected: 'on' })).toEqual({
			requestId: 7,
			cashCollected: true
		});
		expect(deliveryDoneSchema.parse({ requestId: '7' }).cashCollected).toBe(false);
	});

	it('refuses a tampered line or request id', () => {
		expect(deliveryUnloadSchema.safeParse({ itemId: '-1' }).success).toBe(false);
		expect(deliveryDoneSchema.safeParse({ requestId: 'x' }).success).toBe(false);
	});
});
