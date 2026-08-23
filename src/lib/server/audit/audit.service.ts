import { database, type Tx } from '../db/client';
import { auditLog } from '../db/schema';

export interface AuditEntry {
	readonly actorId: number | null;
	readonly action: string;
	readonly entity: string;
	readonly entityId: number | null;
	readonly before?: Record<string, unknown>;
	readonly after?: Record<string, unknown>;
	readonly ip?: string | null;
	readonly requestId?: string | null;
}

/**
 * Every mutating action lands here. `before` and `after` hold field names and ids only:
 * passwords, tokens and e-mail addresses never reach the journal.
 */
export class AuditService {
	static record(entry: AuditEntry, tx?: Tx): void {
		(tx ?? database)
			.insert(auditLog)
			.values({
				actorId: entry.actorId,
				action: entry.action,
				entity: entry.entity,
				entityId: entry.entityId,
				before: entry.before ?? null,
				after: entry.after ?? null,
				ip: entry.ip ?? null,
				requestId: entry.requestId ?? null
			})
			.run();
	}
}
