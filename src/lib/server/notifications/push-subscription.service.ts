import { contourAccess, PolicyService } from '../auth/policy';
import { config } from '../config';
import { NotFoundError, ValidationError } from '../core/errors';
import { BaseService } from '../core/service';
import { withTransaction } from '../core/tx';
import { PushSubscriptionRepository } from './push-subscription.repository';
import type { ActorContext } from '$lib/types/actor';
import type { PushStateDto } from '$lib/types/push';
import type { PushSubscriptionInput } from '$lib/validation/push';

export const MAX_DEVICES = 10;

// The server posts to the endpoint a client names, so with real pushes on only the hosts of the
// push services of Chrome, Safari, Firefox and Edge are taken.
const PUSH_HOSTS = [
	/^fcm\.googleapis\.com$/,
	/\.push\.apple\.com$/,
	/^updates\.push\.services\.mozilla\.com$/,
	/\.notify\.windows\.com$/
];

/** Push on the devices of the actor. A device setting, not a business action: no audit row. */
export class PushSubscriptionService extends BaseService {
	constructor(
		ctx: ActorContext,
		private readonly subscriptions: PushSubscriptionRepository = new PushSubscriptionRepository(),
		private readonly publicKey: string = config.VAPID_PUBLIC_KEY,
		private readonly knownHostsOnly: boolean = config.PUSH_DRIVER === 'webpush'
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

	/** @throws ValidationError for an endpoint outside the known push services. */
	subscribe(input: PushSubscriptionInput): PushStateDto {
		this.assertContour();
		const host = new URL(input.endpoint).hostname;
		if (this.knownHostsOnly && !PUSH_HOSTS.some((known) => known.test(host))) {
			throw new ValidationError('Этот браузер не поддерживается', { field: 'endpoint' });
		}
		withTransaction((tx) => {
			this.subscriptions.save(this.ctx.userId, input, tx);
			this.subscriptions.trim(this.ctx.userId, MAX_DEVICES, tx);
		});
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
