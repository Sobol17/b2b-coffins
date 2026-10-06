import type { EventKey } from './events';
import type { NotificationChannel } from './notifications';
import type { RoleCode } from './roles';

// crm-notifications.ts — the matrix the owner reads (C12, v1.49). The seed writes it.
export interface NotificationRuleCellDto {
	eventKey: EventKey;
	roleCode: RoleCode;
	channel: NotificationChannel;
	enabled: boolean;
	isLive: boolean; // false while the channel waits for its driver
}
