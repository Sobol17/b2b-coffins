import type { EventKey } from './events';
import type { Page } from './list';

// notifications.ts — personal settings and the delivery log of a portal user (P9).
export const NOTIFICATION_CHANNELS = ['email', 'push'] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];
/** Channels a user can switch today. Push joins in C15 together with the service worker. */
export const LIVE_CHANNELS = ['email'] as const satisfies readonly NotificationChannel[];
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
	email: string;
	prefs: NotificationPrefDto[];
	log: Page<NotificationLogItemDto>;
}
