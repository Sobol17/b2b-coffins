import { z } from 'zod';
import { EVENT_KEYS } from '$lib/types/events';
import { NOTIFICATION_STATUSES } from '$lib/types/notifications';
import { definedProps } from '$lib/utils/props';

const endpoint = z.url({ protocol: /^https$/ }).max(2000);

export const pushSubscriptionSchema = z.strictObject({
	endpoint,
	p256dh: z.string().min(1).max(200),
	auth: z.string().min(1).max(100)
});
export type PushSubscriptionInput = z.infer<typeof pushSubscriptionSchema>;

export const pushUnsubscribeSchema = z.strictObject({ endpoint });

// A checkbox sends `on` or nothing, so an absent field means the template is switched off.
export const pushTemplateSchema = z.strictObject({
	eventKey: z.enum(EVENT_KEYS, { error: 'Неизвестное событие' }),
	title: z.string().trim().min(1, 'Введите заголовок').max(80, 'Заголовок длиннее 80 символов'),
	body: z.string().trim().min(1, 'Введите текст').max(200, 'Текст длиннее 200 символов'),
	isActive: z.preprocess((value) => value === 'on' || value === true, z.boolean())
});
export type PushTemplateInput = z.infer<typeof pushTemplateSchema>;

const blankAsAbsent = (value: unknown): unknown => (value === '' ? undefined : value);

/** Filters of the owner's log. Unknown query keys are dropped, an empty value means no filter. */
export const deliveryFiltersSchema = z
	.object({
		eventKey: z.preprocess(blankAsAbsent, z.enum(EVENT_KEYS).optional()),
		status: z.preprocess(blankAsAbsent, z.enum(NOTIFICATION_STATUSES).optional())
	})
	.transform((filters) => definedProps(filters));
export type DeliveryFilters = z.infer<typeof deliveryFiltersSchema>;
