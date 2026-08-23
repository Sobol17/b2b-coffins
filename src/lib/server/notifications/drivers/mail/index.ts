export interface MailMessage {
	readonly to: string;
	readonly subject: string;
	readonly text: string;
}

export interface MailDriver {
	send(message: MailMessage): Promise<void>;
}

export { FakeMailDriver, fakeMailDriver } from './fake';
