import type { EventKey } from '$lib/types/events';
import type { NotificationChannel, NotificationStatus } from '$lib/types/notifications';
import type { StatusTone } from '$lib/ui';

export interface EventLabel {
	readonly title: string;
	readonly hint: string;
}

export const EVENT_LABEL: Readonly<Record<EventKey, EventLabel>> = {
	'request.submitted': { title: 'Новая заявка', hint: 'Контрагент отправил заявку' },
	'request.accepted': { title: 'Заявка принята в работу', hint: 'Менеджер зафиксировал состав' },
	'request.ready': { title: 'Заявка готова к выдаче', hint: 'Изделия готовы и упакованы' },
	'request.delivered': { title: 'Заявка доставлена', hint: 'Водитель передал изделия' },
	'request.cancelled': { title: 'Заявка отменена', hint: 'Контрагент отменил заявку' },
	'request.rejected': { title: 'Заявка отклонена', hint: 'Мастерская не приняла заявку' },
	'request.payment_marked': { title: 'Оплата получена', hint: 'Мастерская отметила платёж' },
	'request.paid': { title: 'Заявка оплачена', hint: 'Оплата покрыла всю сумму' },
	'stock.below_threshold': { title: 'Остаток ниже порога', hint: 'Позиция склада заканчивается' },
	'payroll.week_closed': { title: 'Неделя закрыта', hint: 'Ведомость готова к выплате' }
};

export const CHANNEL_LABEL: Readonly<Record<NotificationChannel, string>> = {
	email: 'Почта',
	push: 'Push'
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
