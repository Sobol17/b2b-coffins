import { z } from 'zod';
import { logger } from '../../../logger';
import type { MailDriver, MailMessage } from './index';

const messageSchema = z.object({
	to: z.email(),
	subject: z.string().min(1),
	text: z.string().min(1)
});

/**
 * Fake from day one, per tech.md 3. It validates its input and throws on rubbish, so a broken
 * template fails a test instead of quietly reaching a real mailbox later.
 */
export class FakeMailDriver implements MailDriver {
	readonly sent: MailMessage[] = [];
	private failNext = false;

	failOnce(): void {
		this.failNext = true;
	}

	async send(message: MailMessage): Promise<void> {
		const parsed = messageSchema.safeParse(message);
		if (!parsed.success)
			throw new Error(`fake mail driver got an invalid message: ${z.prettifyError(parsed.error)}`);

		if (this.failNext) {
			this.failNext = false;
			throw new Error('fake mail driver failure');
		}

		this.sent.push(parsed.data);
		// Subject only: the body of a reset mail carries a token.
		logger.info({ subject: parsed.data.subject }, 'fake mail sent');
	}

	reset(): void {
		this.sent.length = 0;
		this.failNext = false;
	}
}

export const fakeMailDriver = new FakeMailDriver();
