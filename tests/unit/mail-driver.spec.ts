import nodemailer from 'nodemailer';
import { describe, expect, it } from 'vitest';
import { parseConfig } from '../../src/lib/server/config';
import { FakeMailDriver } from '../../src/lib/server/notifications/drivers/mail';
import { createMailDriver } from '../../src/lib/server/notifications/drivers/mail/select';
import { SmtpMailDriver } from '../../src/lib/server/notifications/drivers/mail/smtp';

const base = { SESSION_SECRET: 'unit-session-secret-value-at-least-32-chars' };
const smtp = {
	host: 'smtp.example.org',
	port: 587,
	user: 'robot',
	pass: 'secret',
	from: 'Мастерская <robot@example.org>'
};
const message = { to: 'admin@ritual-service.example', subject: 'Заявка готова', text: 'Текст' };

describe('mail driver selection (P9)', () => {
	it('keeps the fake unless the config asks for smtp', () => {
		expect(createMailDriver(parseConfig(base))).toBeInstanceOf(FakeMailDriver);
	});

	it('builds the smtp driver from the smtp keys', () => {
		const env = parseConfig({
			...base,
			MAIL_DRIVER: 'smtp',
			SMTP_HOST: smtp.host,
			MAIL_FROM: smtp.from
		});

		expect(createMailDriver(env)).toBeInstanceOf(SmtpMailDriver);
	});

	it('refuses to boot real mail without a server or a sender', () => {
		expect(() => parseConfig({ ...base, MAIL_DRIVER: 'smtp' })).toThrow(/SMTP_HOST.*MAIL_FROM/);
	});
});

describe('SmtpMailDriver', () => {
	it('hands the message to the transport with the configured sender', async () => {
		const transport = nodemailer.createTransport({ jsonTransport: true });
		const sent: unknown[] = [];
		const spy = transport.sendMail.bind(transport);
		transport.sendMail = (async (mail: Parameters<typeof spy>[0]) => {
			const info = await spy(mail);
			sent.push(JSON.parse(String(info.message)));
			return info;
		}) as typeof transport.sendMail;

		await new SmtpMailDriver(smtp, transport).send(message);

		expect(sent).toEqual([
			expect.objectContaining({
				subject: 'Заявка готова',
				text: 'Текст',
				from: { address: 'robot@example.org', name: 'Мастерская' },
				to: [{ address: 'admin@ritual-service.example', name: '' }]
			})
		]);
	});

	it('fails when the server refuses the recipient', async () => {
		const transport = nodemailer.createTransport({ jsonTransport: true });
		transport.sendMail = (async () => ({
			rejected: [message.to],
			accepted: [],
			messageId: 'x'
		})) as unknown as typeof transport.sendMail;

		await expect(new SmtpMailDriver(smtp, transport).send(message)).rejects.toThrow(/rejected/);
	});

	it('passes a transport failure up so the queue can retry', async () => {
		const transport = nodemailer.createTransport({ jsonTransport: true });
		transport.sendMail = (async () => {
			throw new Error('ECONNREFUSED');
		}) as unknown as typeof transport.sendMail;

		await expect(new SmtpMailDriver(smtp, transport).send(message)).rejects.toThrow('ECONNREFUSED');
	});
});
