import type { ResolvedPathname } from '$app/types';
import type { EventKey } from '$lib/types/events';
import type {
	NotificationChannel,
	NotificationFeedItemDto,
	NotificationStatus
} from '$lib/types/notifications';
import type { StatusTone } from '$lib/ui';

export interface EventLabel {
	readonly title: string;
	readonly hint: string;
}

export const EVENT_LABEL: Readonly<Record<EventKey, EventLabel>> = {
	'request.submitted': { title: 'Новая заявка', hint: 'Контрагент отправил заявку' },
	'request.accepted': {
		title: 'Заявка принята в работу',
		hint: 'Администратор мастерской зафиксировал состав'
	},
	'request.ready': { title: 'Заявка готова к выдаче', hint: 'Изделия готовы и упакованы' },
	'request.delivered': { title: 'Заявка доставлена', hint: 'Водитель передал изделия' },
	'request.cancelled': { title: 'Заявка отменена', hint: 'Контрагент отменил заявку' },
	'request.rejected': { title: 'Заявка отклонена', hint: 'Мастерская не приняла заявку' },
	'request.payment_marked': { title: 'Оплата получена', hint: 'Мастерская отметила платёж' },
	'request.paid': { title: 'Заявка оплачена', hint: 'Оплата покрыла всю сумму' },
	'stock.below_threshold': { title: 'Остаток ниже порога', hint: 'Позиция склада заканчивается' },
	'payroll.week_closed': { title: 'Неделя закрыта', hint: 'Ведомость готова к выплате' }
};

/** What a feed line is about: the request number, the stock item or the payroll week. */
export function feedSubject(item: NotificationFeedItemDto): string {
	if (item.requestNumber !== null) return item.requestNumber;
	if (item.entityLabel === null) return '—';
	return item.eventKey === 'payroll.week_closed'
		? `Неделя с ${item.entityLabel}`
		: item.entityLabel;
}

/** Where a feed line leads; null keeps it plain text. Each contour brings its own routes. */
export type FeedHref = (item: NotificationFeedItemDto) => ResolvedPathname | null;

export const CHANNEL_LABEL: Readonly<Record<NotificationChannel, string>> = {
	push: 'Пуш',
	max: 'Бот в МАКС'
};

export const DELIVERY_LABEL: Readonly<Record<NotificationStatus, string>> = {
	queued: 'В очереди',
	sent: 'Отправлено',
	failed: 'Повтор отправки'
};

/** A failed row is retried by the queue, so it reads as a warning, not as a dead end. */
export const DELIVERY_TONE: Readonly<Record<NotificationStatus, StatusTone>> = {
	queued: 'neutral',
	sent: 'success',
	failed: 'warning'
};
