import { z } from 'zod';
import { EVENT_KEYS } from '$lib/types/events';
import { NOTIFICATION_CHANNELS } from '$lib/types/notifications';

const switchValue = z
	.string()
	.regex(
		new RegExp(
			`^(${EVENT_KEYS.join('|').replaceAll('.', '\\.')}):(${NOTIFICATION_CHANNELS.join('|')})$`
		),
		{
			error: 'Неизвестная настройка уведомлений'
		}
	);

/**
 * The settings form of P9: every checked switch sends `enabled=<eventKey>:<channel>`, an unchecked
 * one sends nothing. The service refuses a pair the user is not offered.
 */
export const notificationPrefsSchema = z.object({
	enabled: z.array(switchValue).max(EVENT_KEYS.length * NOTIFICATION_CHANNELS.length)
});

export type NotificationPrefsInput = z.infer<typeof notificationPrefsSchema>;
