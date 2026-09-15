import { config } from '../../config';
import type { MailMessage } from '../drivers/mail';

/** Access mail for a new portal account. The only place a temporary password is ever written. */
export function staffAccessMail(input: {
	readonly to: string;
	readonly counterpartyName: string;
	readonly temporaryPassword: string;
}): MailMessage {
	return {
		to: input.to,
		subject: 'Доступ к порталу заявок',
		text: [
			`Для вас создан доступ к порталу контрагента «${input.counterpartyName}».`,
			'',
			`Адрес входа: ${config.ORIGIN}/login`,
			`Логин: ${input.to}`,
			`Временный пароль: ${input.temporaryPassword}`,
			'',
			'При первом входе портал попросит задать собственный пароль.'
		].join('\n')
	};
}
