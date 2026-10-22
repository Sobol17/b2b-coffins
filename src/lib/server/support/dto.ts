import type { SupportMessageRow } from './support-message.repository';
import type { SupportThreadRow } from './support-thread.repository';
import { ROLE_TITLE } from '$lib/crm/labels';
import { awaitingSide } from '$lib/domain/support/awaiting';
import type { ActorContext } from '$lib/types/actor';
import type { RoleCode } from '$lib/types/roles';
import type {
	SupportMessageDto,
	SupportThreadDto,
	SupportThreadListItemDto
} from '$lib/types/support';

// The title a message is signed with, highest role first.
const ROLE_ORDER: readonly RoleCode[] = ['owner', 'manager', 'cp_admin', 'cp_employee'];

/** Support threads carry no money: a request is its number and nothing else (tech.md 8.1). */
export class SupportDtoMapper {
	static toListItem(row: SupportThreadRow): SupportThreadListItemDto {
		return {
			id: row.id,
			subject: row.subject,
			status: row.status,
			awaiting: awaitingSide(row.status, row.lastMessageSide),
			counterpartyName: row.counterpartyName,
			authorName: row.authorName,
			requestId: row.requestId,
			requestNumber: row.requestNumber,
			lastMessageAt: row.lastMessageAt.toISOString(),
			createdAt: row.createdAt.toISOString()
		};
	}

	static toThread(
		row: SupportThreadRow,
		messages: readonly SupportMessageRow[],
		ctx: ActorContext
	): SupportThreadDto {
		// The row came through the fence, so an open thread is one the actor may write and close.
		const open = row.status === 'open';
		return {
			...SupportDtoMapper.toListItem(row),
			counterpartyId: row.counterpartyId,
			closedAt: row.closedAt?.toISOString() ?? null,
			closedByName: row.closedByName,
			canPost: open,
			canClose: open,
			messages: messages.map((message) => SupportDtoMapper.toMessage(message, ctx))
		};
	}

	static toMessage(row: SupportMessageRow, ctx: ActorContext): SupportMessageDto {
		return {
			id: row.id,
			side: row.side,
			authorName: row.authorName,
			authorRole: roleTitle(row.authorRoles),
			isMine: row.authorId === ctx.userId,
			body: row.body,
			createdAt: row.createdAt.toISOString()
		};
	}
}

function roleTitle(roles: readonly RoleCode[]): string {
	const role = ROLE_ORDER.find((code) => roles.includes(code));
	if (role === undefined) return '';
	// The portal knows the workshop people as «администратор мастерской» (tech.md v1.42).
	return role === 'owner' || role === 'manager'
		? `${ROLE_TITLE[role]} мастерской`
		: ROLE_TITLE[role];
}
