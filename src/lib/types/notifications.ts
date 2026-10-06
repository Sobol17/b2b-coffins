import type { EventKey } from './events';
import type { Page } from './list';

// notifications.ts — personal settings and the delivery log of a user (P9).
// Mail is not a channel since v1.49: it carries access letters only, events go to the bell and push.
export const NOTIFICATION_CHANNELS = ['push', 'max'] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];
/** Channels a driver sends over today: none. Push joins in C15, the MAX bot in C16. */
export const LIVE_CHANNELS: readonly NotificationChannel[] = [];
export const NOTIFICATION_STATUSES = ['queued', 'sent', 'failed'] as const;
export type NotificationStatus = (typeof NOTIFICATION_STATUSES)[number];

export interface NotificationPrefDto {
	eventKey: EventKey;
	channel: NotificationChannel;
	enabled: boolean;
	isDefault: boolean; // true while no personal choice overrides the role rule
}
export interface NotificationLogItemDto {
	id: number;
	eventKey: EventKey;
	channel: NotificationChannel;
	status: NotificationStatus;
	attempts: number;
	requestId: number | null;
	requestNumber: string | null;
	createdAt: string;
	sentAt: string | null; // the driver error stays in the database
}
export interface NotificationSettingsDto {
	prefs: NotificationPrefDto[];
	log: Page<NotificationLogItemDto>;
}

// The bell of the portal header (v1.33). The feed is not a channel: a user cannot switch it off.
export interface NotificationFeedItemDto {
	id: number;
	eventKey: EventKey;
	requestId: number | null;
	requestNumber: string | null; // null when the row points outside the actor's counterparty
	entityId: number | null; // stock item or payroll week of a workshop event, null elsewhere
	entityLabel: string | null;
	isRead: boolean;
	createdAt: string;
}
export interface NotificationBellDto {
	unread: number;
	items: NotificationFeedItemDto[];
}
