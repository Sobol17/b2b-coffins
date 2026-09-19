import { PolicyService } from '../auth/policy';
import { normalizeListQuery } from '../core/list';
import { BaseService } from '../core/service';
import { NotificationDtoMapper } from './dto';
import { NotificationFeedRepository } from './notification-feed.repository';
import type { ActorContext } from '$lib/types/actor';
import type { ListQuery, Page } from '$lib/types/list';
import type { NotificationBellDto, NotificationFeedItemDto } from '$lib/types/notifications';

/** How many events the bell panel shows before it sends the reader to the full list. */
export const BELL_LIMIT = 10;

/**
 * The in-app feed of P12. It mirrors the events a person is addressed by and cannot be switched
 * off, so it has no settings of its own: only reading and marking read.
 */
export class NotificationFeedService extends BaseService {
	constructor(
		ctx: ActorContext,
		private readonly feed: NotificationFeedRepository = new NotificationFeedRepository()
	) {
		super(ctx);
	}

	/** Counter and the newest events for the header bell. @throws ForbiddenError outside the portal. */
	bell(limit: number = BELL_LIMIT): NotificationBellDto {
		this.assertPortal();
		return {
			unread: this.feed.unreadCount(this.ctx),
			items: this.feed.page(this.ctx, limit, 0).rows.map(NotificationDtoMapper.toFeedItem)
		};
	}

	/** The full list of the settings page. @throws ForbiddenError outside the portal. */
	list(query: Partial<ListQuery> = {}): Page<NotificationFeedItemDto> {
		this.assertPortal();
		const { page, perPage } = normalizeListQuery(query);
		const found = this.feed.page(this.ctx, perPage, (page - 1) * perPage);
		return {
			rows: found.rows.map(NotificationDtoMapper.toFeedItem),
			total: found.total,
			page,
			perPage
		};
	}

	/**
	 * Marks the rows the reader just saw and answers with what is left unread. Not audited: the
	 * journal records what people change in the business, not that a panel was opened.
	 * @throws ForbiddenError outside the portal.
	 */
	markRead(ids: readonly number[], at: Date = new Date()): number {
		this.assertPortal();
		this.feed.markRead(this.ctx, ids, at);
		return this.feed.unreadCount(this.ctx);
	}

	private assertPortal(): void {
		this.assert(
			this.ctx.scope === 'portal' && PolicyService.can(this.ctx, 'portal.access'),
			'portal.access'
		);
	}
}
