import { z } from 'zod';
import { logger } from '../../../logger';
import type { PushDriver, PushMessage, PushTarget } from './index';

const targetSchema = z.object({
	endpoint: z.url({ protocol: /^https$/ }),
	p256dh: z.string().min(1),
	auth: z.string().min(1)
});

const messageSchema = z.strictObject({
	title: z.string().min(1).max(80),
	body: z.string().min(1).max(200),
	// Deep link inside the app only: a push must never send the user off the host.
	url: z.string().regex(/^\/(?!\/)/),
	tag: z.string().min(1).optional()
});

export interface SentPush {
	readonly target: PushTarget;
	readonly message: PushMessage;
}

/** Same shape as the mail fake: validates input, fails or hangs on request, records what it sent. */
export class FakePushDriver implements PushDriver {
	readonly sent: SentPush[] = [];
	private failNext = false;
	private hangNext = false;

	failOnce(): void {
		this.failNext = true;
	}

	hangOnce(): void {
		this.hangNext = true;
	}

	async send(target: PushTarget, message: PushMessage): Promise<void> {
		const parsedTarget = targetSchema.safeParse(target);
		const parsedMessage = messageSchema.safeParse(message);
		if (!parsedTarget.success || !parsedMessage.success) {
			throw new Error('fake push driver got an invalid target or message');
		}

		if (this.failNext) {
			this.failNext = false;
			throw new Error('fake push driver failure');
		}
		if (this.hangNext) {
			this.hangNext = false;
			return new Promise<void>(() => {});
		}

		this.sent.push({ target, message });
		logger.info({ tag: message.tag ?? null }, 'fake push sent');
	}

	reset(): void {
		this.sent.length = 0;
		this.failNext = false;
		this.hangNext = false;
	}
}

export const fakePushDriver = new FakePushDriver();
