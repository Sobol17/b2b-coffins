import { CharityFreezer } from '../charity/charity-freezer';
import type { Tx } from '../db/client';
import { bus } from '../events/bus';
import type { EventKey } from '$lib/types/events';
import type { EffectCode } from '$lib/types/request';

type EmitEffect = Extract<EffectCode, `emit:${string}`>;

const EVENT_OF: Readonly<Record<EmitEffect, EventKey>> = {
	'emit:request.accepted': 'request.accepted',
	'emit:request.cancelled': 'request.cancelled',
	'emit:request.rejected': 'request.rejected',
	'emit:request.ready': 'request.ready',
	'emit:request.delivered': 'request.delivered',
	'emit:request.paid': 'request.paid'
};

/**
 * Side effects named by the transition table (tech.md 6.2). They run inside the transaction of the
 * move, so a failing effect rolls the status back with it (invariant 4).
 */
export interface RequestEffects {
	apply(effect: EffectCode, requestId: number, tx: Tx): void;
}

export class OutboxRequestEffects implements RequestEffects {
	constructor(private readonly charity: CharityFreezer = new CharityFreezer()) {}

	apply(effect: EffectCode, requestId: number, tx: Tx): void {
		switch (effect) {
			case 'emit:request.accepted':
			case 'emit:request.cancelled':
			case 'emit:request.rejected':
			case 'emit:request.ready':
			case 'emit:request.delivered':
			case 'emit:request.paid':
				return bus.emit(EVENT_OF[effect], requestId, tx);
			// The audit row comes from BaseService.audited, which wraps every move.
			case 'audit':
				return;
			case 'freezeCharity':
				return this.charity.freeze(requestId, tx);
		}
	}
}
