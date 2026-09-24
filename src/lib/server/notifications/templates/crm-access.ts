import { config } from '../../config';
import type { MailMessage } from '../drivers/mail';

/** Access mail for a workshop account: a new one, or a password the owner reset (C1). */
export function crmAccessMail(input: {
	readonly to: string;
	readonly temporaryPassword: string;
	readonly isReset: boolean;
}): MailMessage {
	return {
		to: input.to,
		subject: input.isReset ? 'Новый пароль к CRM мастерской' : 'Доступ к CRM мастерской',
		text: [
			input.isReset
				? 'Руководитель сбросил пароль вашей учётной записи в CRM мастерской.'
				: 'Для вас создан доступ к CRM мастерской.',
			'',
			`Адрес входа: ${config.ORIGIN}/login`,
			`Логин: ${input.to}`,
			`Временный пароль: ${input.temporaryPassword}`,
			'',
			'При первом входе система попросит задать собственный пароль.'
		].join('\n')
	};
}
