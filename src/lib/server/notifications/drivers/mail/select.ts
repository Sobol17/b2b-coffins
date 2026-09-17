import { config, type AppConfig } from '../../../config';
import { fakeMailDriver } from './fake';
import type { MailDriver } from './index';
import { SmtpMailDriver } from './smtp';

type MailConfig = Pick<
	AppConfig,
	'MAIL_DRIVER' | 'SMTP_HOST' | 'SMTP_PORT' | 'SMTP_USER' | 'SMTP_PASS' | 'MAIL_FROM'
>;

export function createMailDriver(env: MailConfig): MailDriver {
	if (env.MAIL_DRIVER === 'fake') return fakeMailDriver;
	return new SmtpMailDriver({
		host: env.SMTP_HOST,
		port: env.SMTP_PORT,
		user: env.SMTP_USER,
		pass: env.SMTP_PASS,
		from: env.MAIL_FROM
	});
}

let selected: MailDriver | null = null;

/** The driver `MAIL_DRIVER` names. One transport per process: it pools the SMTP connection. */
export function mailDriver(): MailDriver {
	selected ??= createMailDriver(config);
	return selected;
}
