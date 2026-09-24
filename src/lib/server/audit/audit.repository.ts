import { and, asc, desc, eq, gte, lte } from 'drizzle-orm';
import { countExpression, offsetFor } from '../core/list';
import { BaseRepository } from '../core/repository';
import { containsText } from '../core/search';
import { auditLog, users } from '../db/schema';
import type { DateWindow } from '$lib/domain/request/registry';
import type { AuditFilters } from '$lib/types/crm';
import type { ListQuery } from '$lib/types/list';

export interface AuditRow {
	readonly id: number;
	readonly createdAt: Date;
	readonly actorName: string | null;
	readonly action: string;
	readonly entity: string;
	readonly entityId: number | null;
	readonly before: Record<string, unknown> | null;
	readonly after: Record<string, unknown> | null;
	readonly ip: string | null;
}

export interface AuditQuery extends ListQuery<AuditFilters> {
	readonly window: DateWindow;
}

export class AuditRepository extends BaseRepository<typeof auditLog> {
	constructor() {
		super(auditLog);
	}

	/** Newest first: the journal is read to find out what just happened. */
	list(query: AuditQuery): { rows: AuditRow[]; total: number } {
		const filters = query.filters;
		const where = and(
			filters?.actor === undefined ? undefined : containsText(users.fullName, filters.actor),
			filters?.action === undefined ? undefined : eq(auditLog.action, filters.action),
			filters?.entity === undefined ? undefined : eq(auditLog.entity, filters.entity),
			query.window.from === undefined ? undefined : gte(auditLog.createdAt, query.window.from),
			query.window.to === undefined ? undefined : lte(auditLog.createdAt, query.window.to)
		);
		const [counted] = this.db()
			.select({ total: countExpression })
			.from(auditLog)
			.leftJoin(users, eq(users.id, auditLog.actorId))
			.where(where)
			.all();
		const rows = this.db()
			.select({
				id: auditLog.id,
				createdAt: auditLog.createdAt,
				actorName: users.fullName,
				action: auditLog.action,
				entity: auditLog.entity,
				entityId: auditLog.entityId,
				before: auditLog.before,
				after: auditLog.after,
				ip: auditLog.ip
			})
			.from(auditLog)
			.leftJoin(users, eq(users.id, auditLog.actorId))
			.where(where)
			.orderBy(query.dir === 'asc' ? asc(auditLog.id) : desc(auditLog.id))
			.limit(query.perPage)
			.offset(offsetFor(query))
			.all();
		return { rows, total: counted?.total ?? 0 };
	}

	/** Values the filter selects offer: only what the journal actually holds. */
	distinct(column: 'action' | 'entity'): string[] {
		const field = column === 'action' ? auditLog.action : auditLog.entity;
		return this.db()
			.selectDistinct({ value: field })
			.from(auditLog)
			.orderBy(asc(field))
			.all()
			.map((row) => row.value);
	}
}
