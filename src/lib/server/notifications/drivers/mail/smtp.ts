import nodemailer, { type Transporter } from 'nodemailer';
import type { MailDriver, MailMessage } from './index';

export interface SmtpSettings {
	readonly host: string;
	readonly port: number;
	readonly user: string;
	readonly pass: string;
	readonly from: string;
}

// The queue worker gives a job a minute; SMTP must give up well before, so a retry gets its turn.
const SOCKET_TIMEOUT_MS = 20_000;

/** Real mail over SMTP (tech.md 3). Port 465 speaks TLS from the start, the others upgrade. */
export class SmtpMailDriver implements MailDriver {
	private readonly transport: Transporter;

	constructor(
		private readonly settings: SmtpSettings,
		transport?: Transporter
	) {
		this.transport =
			transport ??
			nodemailer.createTransport({
				host: settings.host,
				port: settings.port,
				secure: settings.port === 465,
				requireTLS: settings.port !== 465,
				...(settings.user ? { auth: { user: settings.user, pass: settings.pass } } : {}),
				connectionTimeout: SOCKET_TIMEOUT_MS,
				greetingTimeout: SOCKET_TIMEOUT_MS,
				socketTimeout: SOCKET_TIMEOUT_MS
			});
	}

	async send(message: MailMessage): Promise<void> {
		const info = await this.transport.sendMail({
			from: this.settings.from,
			to: message.to,
			subject: message.subject,
			text: message.text
		});
		// A server can accept the session and still refuse the only recipient. Non-SMTP transports
		// leave the list out.
		const rejected: unknown[] | undefined = info.rejected;
		if (rejected && rejected.length > 0) throw new Error('smtp server rejected the recipient');
	}
}
