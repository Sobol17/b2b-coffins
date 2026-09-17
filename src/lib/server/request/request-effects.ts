import { CharityFreezer } from '../charity/charity-freezer';
import type { Tx } from '../db/client';
import { bus } from '../events/bus';
import type { EffectCode } from '$lib/types/request';

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
			case 'emit:request.ready':
				return bus.emit('request.ready', requestId, tx);
			case 'emit:request.delivered':
				return bus.emit('request.delivered', requestId, tx);
			case 'emit:request.paid':
				return bus.emit('request.paid', requestId, tx);
			// The audit row comes from BaseService.audited, which wraps every move.
			case 'audit':
				return;
			case 'freezeCharity':
				return this.charity.freeze(requestId, tx);
			// Stock moves are wired in C8 (tech.md 14). The table already names them, so that slice
			// plugs an implementation in here without touching the service.
			case 'consumeComponents':
			case 'produceStockItems':
			case 'shipStockItems':
				return;
		}
	}
}
