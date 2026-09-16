import { PolicyService } from '../auth/policy';
import { BaseService } from '../core/service';
import { OrgService } from '../settings/org.service';
import { CharityTotalsRepository } from './charity-totals.repository';
import { CharitySettings } from './charity-settings';
import { formatCharityScope, yearInZone } from '$lib/domain/charity/rate';
import type { ActorContext } from '$lib/types/actor';
import type { CharityBannerDto } from '$lib/types/charity';
import { definedProps } from '$lib/utils/props';

/** The donation banner of the portal home (tech.md 14, P8). */
export class CharityBannerService extends BaseService {
	constructor(
		ctx: ActorContext,
		private readonly totals: CharityTotalsRepository = new CharityTotalsRepository(),
		private readonly settings: CharitySettings = new CharitySettings()
	) {
		super(ctx);
	}

	/**
	 * Public figures for every portal role, the own contribution only for a role with prices.
	 * @returns null while the workshop has not named a fund.
	 * @throws ForbiddenError outside the portal contour.
	 */
	banner(now: Date = new Date()): CharityBannerDto | null {
		this.assert(
			this.ctx.scope === 'portal' && PolicyService.can(this.ctx, 'portal.access'),
			'portal.access'
		);
		const fund = this.settings.fund();
		if (!fund) return null;

		const all = this.totals.findByScope(formatCharityScope({ kind: 'all' }));
		const year = this.totals.findByScope(
			formatCharityScope({ kind: 'year', year: yearInZone(now, OrgService.timezone()) })
		);
		return {
			fundTitle: fund.title,
			fundUrl: fund.url ?? null,
			publicTotalMinor: all?.amountMinor ?? 0,
			publicYearMinor: year?.amountMinor ?? 0,
			publicRequestCount: all?.requestCount ?? 0,
			...definedProps({ ownTotalMinor: this.ownTotal() })
		};
	}

	/** The own row is read only for a role with prices: the sum reveals the purchase volume. */
	private ownTotal(): number | undefined {
		if (!this.ctx.canSeePrices || this.ctx.counterpartyId === null) return undefined;
		const scope = formatCharityScope({
			kind: 'counterparty',
			counterpartyId: this.ctx.counterpartyId
		});
		return this.totals.findByScope(scope)?.amountMinor ?? 0;
	}
}
