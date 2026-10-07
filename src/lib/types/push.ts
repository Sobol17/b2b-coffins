import type { EventKey } from './events';
import type { NotificationChannel, NotificationLogItemDto } from './notifications';

export const DELIVERY_FAILURES = ['expired', 'driver'] as const;
export type DeliveryFailure = (typeof DELIVERY_FAILURES)[number];

/** What a page needs to offer push on this device. An empty key means push is not configured. */
export interface PushStateDto {
	publicKey: string;
	deviceCount: number;
}

export interface NotificationTemplateDto {
	eventKey: EventKey;
	channel: NotificationChannel;
	title: string;
	body: string;
	isActive: boolean;
	variables: readonly string[];
}

export interface NotificationTemplatePreviewDto {
	title: string;
	body: string;
}

/** A line of the owner's log. The driver answer stays on the server, the code is all that leaves. */
export interface NotificationDeliveryDto extends NotificationLogItemDto {
	userId: number;
	userName: string;
	failure: DeliveryFailure | null;
}
