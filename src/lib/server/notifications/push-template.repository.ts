import { and, eq } from 'drizzle-orm';
import { BaseRepository } from '../core/repository';
import type { Tx } from '../db/client';
import { notificationTemplates } from '../db/schema';
import type { EventKey } from '$lib/types/events';

export interface PushTemplateText {
	readonly subject: string | null;
	readonly body: string;
	readonly isActive: boolean;
}

export interface PushTemplateRow extends PushTemplateText {
	readonly eventKey: EventKey;
}

const COLUMNS = {
	eventKey: notificationTemplates.eventKey,
	subject: notificationTemplates.subject,
	body: notificationTemplates.body,
	isActive: notificationTemplates.isActive
};

const isPush = eq(notificationTemplates.channel, 'push');

/** Texts of the push channel: one row per event (tech.md 5.9). */
export class PushTemplateRepository extends BaseRepository<typeof notificationTemplates> {
	constructor() {
		super(notificationTemplates);
	}

	all(tx?: Tx): PushTemplateRow[] {
		return this.db(tx).select(COLUMNS).from(notificationTemplates).where(isPush).all();
	}

	find(eventKey: EventKey, tx?: Tx): PushTemplateRow | undefined {
		const [row] = this.db(tx)
			.select(COLUMNS)
			.from(notificationTemplates)
			.where(and(eq(notificationTemplates.eventKey, eventKey), isPush))
			.all();
		return row;
	}

	/** Returns the id of the row, for the audit entry. */
	upsert(eventKey: EventKey, text: PushTemplateText, tx: Tx): number {
		const [saved] = tx
			.insert(notificationTemplates)
			.values({ eventKey, channel: 'push', ...text })
			.onConflictDoUpdate({
				target: [notificationTemplates.eventKey, notificationTemplates.channel],
				set: { subject: text.subject, body: text.body, isActive: text.isActive }
			})
			.returning({ id: notificationTemplates.id })
			.all();
		if (!saved) throw new Error('template upsert returned no row');
		return saved.id;
	}
}
