import { PolicyService } from '../auth/policy';
import { ValidationError } from '../core/errors';
import { BaseService } from '../core/service';
import {
	presetRange,
	reportWindow,
	type ReportRange,
	type ReportWindow
} from '$lib/domain/report/period';
import type { ActorContext } from '$lib/types/actor';
import { isoDay } from '$lib/utils/format';

/**
 * Reports of C13 (tech.md v1.51): only the owner reads them. Every report turns its dates into one
 * half-open window of `org.timezone` here, so two reports never cut a day differently.
 */
export abstract class ReportBaseService extends BaseService {
	protected constructor(
		ctx: ActorContext,
		protected readonly timeZone: string,
		protected readonly now: () => Date
	) {
		super(ctx);
		this.assert(ctx.scope === 'crm' && PolicyService.can(ctx, 'reports.read'), 'reports.read');
	}

	today(): string {
		return isoDay(this.now().toISOString(), this.timeZone);
	}

	/** The current calendar month up to today: what a report opens with. */
	defaultRange(): ReportRange {
		return presetRange('month', this.today());
	}

	/** @throws ValidationError for dates the calendar does not have. */
	protected window(range: ReportRange): ReportWindow {
		const window = reportWindow(range, this.timeZone);
		if (window === null) throw new ValidationError('Выберите даты периода', { field: 'from' });
		return window;
	}
}
