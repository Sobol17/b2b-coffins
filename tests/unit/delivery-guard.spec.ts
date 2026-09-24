import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { isDeliveryFilled } from '../../src/lib/domain/request/delivery';
import { TRANSITIONS, checkTransition } from '../../src/lib/domain/request/state-machine';
import type { DeliveryFacts } from '../../src/lib/domain/request/delivery';

const full: DeliveryFacts = {
	isStockRequest: false,
	deliveryAddressId: 7,
	deliveryAt: new Date('2026-09-25T09:00:00.000Z'),
	deceasedName: 'Иванов Иван Иванович'
};

const empty: DeliveryFacts = {
	isStockRequest: true,
	deliveryAddressId: null,
	deliveryAt: null,
	deceasedName: null
};

describe('isDeliveryFilled', () => {
	it('lets a counterparty request through with all three fields', () => {
		expect(isDeliveryFilled(full)).toBe(true);
	});

	it('lets a stock request through with none of them', () => {
		expect(isDeliveryFilled(empty)).toBe(true);
	});

	it('holds a counterparty request missing any one of the three', () => {
		expect(isDeliveryFilled({ ...full, deliveryAddressId: null })).toBe(false);
		expect(isDeliveryFilled({ ...full, deliveryAt: null })).toBe(false);
		expect(isDeliveryFilled({ ...full, deceasedName: null })).toBe(false);
	});

	it('does not take blanks for a name', () => {
		expect(isDeliveryFilled({ ...full, deceasedName: '   ' })).toBe(false);
	});

	it('never depends on the fields once the request is a stock one', () => {
		fc.assert(
			fc.property(
				fc.option(fc.integer({ min: 1 }), { nil: null }),
				fc.option(fc.date({ noInvalidDate: true }), { nil: null }),
				fc.option(fc.string(), { nil: null }),
				(deliveryAddressId, deliveryAt, deceasedName) => {
					expect(
						isDeliveryFilled({ isStockRequest: true, deliveryAddressId, deliveryAt, deceasedName })
					).toBe(true);
				}
			)
		);
	});
});

describe('the deliveryFilled guard in the state machine', () => {
	it('sits on the draft exit and nowhere else', () => {
		const guarded = TRANSITIONS.filter((t) => (t.guards ?? []).includes('deliveryFilled'));
		expect(guarded).toHaveLength(1);
		expect(guarded[0]).toMatchObject({ from: 'draft', to: 'new' });
	});

	it('refuses the send while the guard is down', () => {
		expect(
			checkTransition({
				from: 'draft',
				to: 'new',
				actorRoles: ['cp_admin'],
				isOwnRequest: true,
				hasReason: false,
				guards: { deliveryFilled: false }
			})
		).toMatchObject({ ok: false, denial: { code: 'guard_failed', guard: 'deliveryFilled' } });
	});

	it('allows the send once the guard is up', () => {
		expect(
			checkTransition({
				from: 'draft',
				to: 'new',
				actorRoles: ['cp_admin'],
				isOwnRequest: true,
				hasReason: false,
				guards: { deliveryFilled: true }
			})
		).toMatchObject({ ok: true });
	});

	it('leaves every later move free of it', () => {
		fc.assert(
			fc.property(fc.constantFrom(...TRANSITIONS), (transition) => {
				const isDraftExit = transition.from === 'draft' && transition.to === 'new';
				expect((transition.guards ?? []).includes('deliveryFilled')).toBe(isDraftExit);
			})
		);
	});
});
