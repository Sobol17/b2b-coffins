import { config, type AppConfig } from '../../../config';
import { fakePushDriver } from './fake';
import type { PushDriver } from './index';
import { WebPushDriver } from './webpush';

type PushConfig = Pick<
	AppConfig,
	'PUSH_DRIVER' | 'VAPID_PUBLIC_KEY' | 'VAPID_PRIVATE_KEY' | 'VAPID_SUBJECT'
>;

export function createPushDriver(env: PushConfig): PushDriver {
	if (env.PUSH_DRIVER === 'fake') return fakePushDriver;
	return new WebPushDriver({
		subject: env.VAPID_SUBJECT,
		publicKey: env.VAPID_PUBLIC_KEY,
		privateKey: env.VAPID_PRIVATE_KEY
	});
}

let selected: PushDriver | null = null;

/** The driver `PUSH_DRIVER` names, one per process. */
export function pushDriver(): PushDriver {
	selected ??= createPushDriver(config);
	return selected;
}
