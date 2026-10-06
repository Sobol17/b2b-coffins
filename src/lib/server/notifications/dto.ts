import type { FeedRow } from './notification-feed.repository';
import type { LogRow } from './notification.repository';
import type { ChannelChoice } from '$lib/domain/notification/matrix';
import type {
	NotificationFeedItemDto,
	NotificationLogItemDto,
	NotificationPrefDto
} from '$lib/types/notifications';
import { formatDate } from '$lib/utils/format';

export class NotificationDtoMapper {
	static toPref(choice: ChannelChoice): NotificationPrefDto {
		return {
			eventKey: choice.eventKey,
			channel: choice.channel,
			enabled: choice.enabled,
			isDefault: choice.isDefault
		};
	}

	/** The driver error stays on the server: an SMTP answer can name hosts and accounts. */
	static toLogItem(row: LogRow): NotificationLogItemDto {
		return {
			id: row.id,
			eventKey: row.eventKey,
			channel: row.channel,
			status: row.status,
			attempts: row.attempts,
			requestId: row.requestId,
			requestNumber: row.requestNumber,
			createdAt: row.createdAt.toISOString(),
			sentAt: row.sentAt?.toISOString() ?? null
		};
	}

	/**
	 * One line of the bell. The event carries no money and no personal data of the deceased. A
	 * payroll week is labelled by its first day in the organisation timezone.
	 */
	static toFeedItem(row: FeedRow, timeZone: string): NotificationFeedItemDto {
		const week = row.weekStartsOn ? formatDate(row.weekStartsOn.toISOString(), timeZone) : null;
		return {
			id: row.id,
			eventKey: row.eventKey,
			requestId: row.requestId,
			requestNumber: row.requestNumber,
			entityId: row.stockItemId ?? row.weekId,
			entityLabel: row.stockItemTitle ?? week,
			isRead: row.readAt !== null,
			createdAt: row.createdAt.toISOString()
		};
	}
}
