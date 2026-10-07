import { PolicyService } from '../auth/policy';
import { normalizeListQuery } from '../core/list';
import { BaseService } from '../core/service';
import { NotificationDtoMapper } from './dto';
import { NotificationDeliveryRepository } from './notification-delivery.repository';
import { failureOf } from '$lib/domain/notification/delivery';
import type { ActorContext } from '$lib/types/actor';
import type { ListQuery, Page } from '$lib/types/list';
import type { NotificationDeliveryDto } from '$lib/types/push';
import type { DeliveryFilters } from '$lib/validation/push';

/** The delivery log of all people, for the owner (C15). */
export class NotificationDeliveryService extends BaseService {
	constructor(
		ctx: ActorContext,
		private readonly deliveries: NotificationDeliveryRepository = new NotificationDeliveryRepository()
	) {
		super(ctx);
	}

	/** @throws ForbiddenError without `settings.manage`. */
	page(query: Partial<ListQuery<DeliveryFilters>> = {}): Page<NotificationDeliveryDto> {
		this.assert(PolicyService.can(this.ctx, 'settings.manage'), 'settings.manage');
		const { page, perPage, filters } = normalizeListQuery(query);
		const found = this.deliveries.page(filters ?? {}, perPage, (page - 1) * perPage);
		return {
			rows: found.rows.map((row) => ({
				...NotificationDtoMapper.toLogItem(row),
				userId: row.userId,
				userName: row.userName,
				// The code only: a push service answer can name hosts and tokens.
				failure: row.status === 'failed' ? failureOf(row.error) : null
			})),
			total: found.total,
			page,
			perPage
		};
	}
}
