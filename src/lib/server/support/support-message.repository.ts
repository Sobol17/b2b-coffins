import { asc, eq, sql } from 'drizzle-orm';
import { BaseRepository } from '../core/repository';
import type { Tx } from '../db/client';
import { roles, supportMessages, userRoles, users } from '../db/schema';
import type { RoleCode } from '$lib/types/roles';
import type { SupportSide } from '$lib/types/support';

export interface SupportMessageRow {
	readonly id: number;
	readonly threadId: number;
	readonly authorId: number;
	readonly authorName: string;
	readonly authorRoles: RoleCode[];
	readonly side: SupportSide;
	readonly body: string;
	readonly createdAt: Date;
}

export interface NewMessage {
	readonly threadId: number;
	readonly authorId: number;
	readonly side: SupportSide;
	readonly body: string;
	readonly at: Date;
}

/** Messages of a support thread. The thread fence is checked by the caller before any read here. */
export class SupportMessageRepository extends BaseRepository<typeof supportMessages> {
	constructor() {
		super(supportMessages);
	}

	insert(row: NewMessage, tx: Tx): number {
		const [created] = tx
			.insert(supportMessages)
			.values({
				threadId: row.threadId,
				authorId: row.authorId,
				side: row.side,
				body: row.body,
				createdAt: row.at
			})
			.returning({ id: supportMessages.id })
			.all();
		if (!created) throw new Error('support message insert returned no row');
		return created.id;
	}

	ofThread(threadId: number, tx?: Tx): SupportMessageRow[] {
		return this.select(tx)
			.where(eq(supportMessages.threadId, threadId))
			.orderBy(asc(supportMessages.createdAt), asc(supportMessages.id))
			.all()
			.map(withRoles);
	}

	find(id: number, tx?: Tx): SupportMessageRow | undefined {
		const [row] = this.select(tx).where(eq(supportMessages.id, id)).all();
		return row ? withRoles(row) : undefined;
	}

	private select(tx?: Tx) {
		return this.db(tx)
			.select({
				id: supportMessages.id,
				threadId: supportMessages.threadId,
				authorId: supportMessages.authorId,
				authorName: users.fullName,
				roleCodes: sql<string | null>`group_concat(${roles.code})`,
				side: supportMessages.side,
				body: supportMessages.body,
				createdAt: supportMessages.createdAt
			})
			.from(supportMessages)
			.innerJoin(users, eq(users.id, supportMessages.authorId))
			.leftJoin(userRoles, eq(userRoles.userId, users.id))
			.leftJoin(roles, eq(roles.id, userRoles.roleId))
			.groupBy(supportMessages.id)
			.$dynamic();
	}
}

function withRoles(row: {
	readonly roleCodes: string | null;
	readonly id: number;
	readonly threadId: number;
	readonly authorId: number;
	readonly authorName: string;
	readonly side: SupportSide;
	readonly body: string;
	readonly createdAt: Date;
}): SupportMessageRow {
	const { roleCodes, ...rest } = row;
	return { ...rest, authorRoles: (roleCodes?.split(',') ?? []) as RoleCode[] };
}
