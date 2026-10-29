import type { Tx } from '../db/client';
import { RequestTransitionService } from '../request/request-transition.service';
import { ShopDispatch } from './shop-dispatch';
import type { ActorContext } from '$lib/types/actor';

/**
 * What follows any change of the shelf or the shop (tech.md §20.4): first the dispatch, while the
 * covered requests are still in work and their undone pieces can come back, then the readiness.
 */
export const ShopFlow = {
	afterChange(ctx: ActorContext, tx: Tx): void {
		new ShopDispatch().run(tx);
		new RequestTransitionService(ctx).settleWork(tx);
	}
};
