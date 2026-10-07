import { contourAccess, PolicyService } from '../auth/policy';
import { config } from '../config';
import { NotFoundError } from '../core/errors';
import { BaseService } from '../core/service';
import { PushSubscriptionRepository } from './push-subscription.repository';
import type { ActorContext } from '$lib/types/actor';
import type { PushStateDto } from '$lib/types/push';
import type { PushSubscriptionInput } from '$lib/validation/push';

/** Push on the devices of the actor. A device setting, not a business action: no audit row. */
export class PushSubscriptionService extends BaseService {
	constructor(
		ctx: ActorContext,
		private readonly subscriptions: PushSubscriptionRepository = new PushSubscriptionRepository(),
		private readonly publicKey: string = config.VAPID_PUBLIC_KEY
	) {
		super(ctx);
	}

	/** @throws ForbiddenError for an actor without a contour of its own. */
	state(): PushStateDto {
		this.assertContour();
		return {
			publicKey: this.publicKey,
			deviceCount: this.subscriptions.liveOf(this.ctx.userId).length
		};
	}

	subscribe(input: PushSubscriptionInput): PushStateDto {
		this.assertContour();
		this.subscriptions.save(this.ctx.userId, input);
		return this.state();
	}

	/** @throws NotFoundError for an endpoint the actor does not own. */
	unsubscribe(endpoint: string): PushStateDto {
		this.assertContour();
		if (!this.subscriptions.remove(this.ctx.userId, endpoint)) {
			throw new NotFoundError('push subscription');
		}
		return this.state();
	}

	private assertContour(): void {
		const action = contourAccess(this.ctx);
		this.assert(PolicyService.can(this.ctx, action), action);
	}
}
