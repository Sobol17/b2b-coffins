import { describe, expect, it } from 'vitest';
import {
	deliveryFiltersSchema,
	pushSubscriptionSchema,
	pushTemplateSchema
} from '../../src/lib/validation/push';

const subscription = { endpoint: 'https://push.example/sub/1', p256dh: 'key', auth: 'secret' };

describe('push validation (C15)', () => {
	it('accepts a subscription of the browser', () => {
		expect(pushSubscriptionSchema.safeParse(subscription).success).toBe(true);
	});

	it('refuses a plain http endpoint and a stray field', () => {
		const http = { ...subscription, endpoint: 'http://push.example/sub/1' };
		expect(pushSubscriptionSchema.safeParse(http).success).toBe(false);
		expect(pushSubscriptionSchema.safeParse({ ...subscription, userId: 7 }).success).toBe(false);
	});

	it('keeps a template inside the limits of a notification', () => {
		const form = { eventKey: 'request.ready', title: 'Заявка {{number}}', body: 'Готова' };
		expect(pushTemplateSchema.parse({ ...form, isActive: 'on' }).isActive).toBe(true);
		expect(pushTemplateSchema.parse(form).isActive).toBe(false);
		expect(pushTemplateSchema.safeParse({ ...form, title: 'а'.repeat(81) }).success).toBe(false);
		expect(pushTemplateSchema.safeParse({ ...form, body: '  ' }).success).toBe(false);
		expect(pushTemplateSchema.safeParse({ ...form, eventKey: 'request.lost' }).success).toBe(false);
	});

	it('reads empty log filters as no filter', () => {
		expect(deliveryFiltersSchema.parse({ eventKey: '', status: '' })).toEqual({});
		expect(deliveryFiltersSchema.parse({ status: 'failed' })).toEqual({ status: 'failed' });
	});
});
