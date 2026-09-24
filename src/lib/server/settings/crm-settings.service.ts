import { PolicyService } from '../auth/policy';
import { CharitySettings } from '../charity/charity-settings';
import { BaseService } from '../core/service';
import type { Tx } from '../db/client';
import { NumberingRepository } from '../numbering/numbering.repository';
import { OrgService } from './org.service';
import { SettingsRepository } from './settings.repository';
import {
	headOf,
	nextNumber,
	periodKeyOf,
	resumeSequence,
	type SequenceState
} from '$lib/domain/numbering/numbering';
import type { ActorContext } from '$lib/types/actor';
import type { CrmSettingsDto, NumberingDto, OrgRequisitesDto } from '$lib/types/crm';
import { definedProps } from '$lib/utils/props';
import { orgRequisitesSchema } from '$lib/validation/settings';
import type { CharityForm, NumberingForm, RequisitesForm } from '$lib/validation/settings-form';

/** Keys of tech.md 5.9 the CRM edits in C1. The rest belong to C10 and C12. */
type EditableKey =
	| 'org.requisites'
	| 'org.timezone'
	| 'charity.rate_bp'
	| 'charity.fund'
	| 'counterparty.staff_limit_default';

/**
 * Organisation settings of the CRM (C1). Every save lands in `audit_log` with the old and the new
 * value under the setting key, so the journal answers "who changed the rate and from what".
 */
export class CrmSettingsService extends BaseService {
	constructor(
		ctx: ActorContext,
		private readonly repo: SettingsRepository = new SettingsRepository(),
		private readonly numbering: NumberingRepository = new NumberingRepository()
	) {
		super(ctx);
		this.assert(
			PolicyService.can(ctx, 'settings.manage') && ctx.scope === 'crm',
			'settings.manage'
		);
	}

	read(now: Date = new Date()): CrmSettingsDto {
		const charity = new CharitySettings(this.repo);
		const fund = charity.fund();
		return {
			requisites: this.requisites(),
			timezone: OrgService.timezone(this.repo),
			numbering: this.numberingOf(now),
			charityRateBp: charity.findRateBp(),
			charityFund: fund && { title: fund.title, ...definedProps({ url: fund.url }) },
			staffLimitDefault: OrgService.staffLimitDefault(this.repo)
		};
	}

	saveRequisites(input: RequisitesForm): void {
		const { name, ...rest } = input;
		this.save({ 'org.requisites': { name, ...definedProps(rest) } });
	}

	saveTimezone(timezone: string): void {
		this.save({ 'org.timezone': timezone });
	}

	/** A new rate applies to deliveries from now on: frozen amounts never move (tech.md 6.2). */
	saveCharity(input: CharityForm): void {
		const fund = { title: input.fundTitle, ...definedProps({ url: input.fundUrl }) };
		this.save({ 'charity.rate_bp': input.rateBp, 'charity.fund': fund });
	}

	saveStaffLimitDefault(limit: number): void {
		this.save({ 'counterparty.staff_limit_default': limit });
	}

	/** Resumes the counter after the highest number of the new form (tech.md 5.9, v1.37). */
	saveNumbering(input: NumberingForm, now: Date = new Date()): NumberingDto {
		return this.audited({ action: 'numbering.update', entity: 'numbering_sequences' }, (tx) => {
			const before = this.stateOf(tx);
			const timeZone = OrgService.timezone(this.repo);
			const head = headOf(input.prefix, periodKeyOf(input.period, now, timeZone));
			const issued = this.numbering.issuedRequestNumbers(head, tx);
			const state = resumeSequence(input, issued, now, timeZone);
			this.numbering.replace('request', state, tx);
			return {
				result: this.numberingOf(now, tx),
				entityId: null,
				before: { prefix: before.prefix, period: before.period, lastValue: before.lastValue },
				after: { prefix: state.prefix, period: state.period, lastValue: state.lastValue }
			};
		});
	}

	private save(values: Partial<Record<EditableKey, unknown>>): void {
		this.audited({ action: 'settings.update', entity: 'settings' }, (tx) => {
			const before: Record<string, unknown> = {};
			for (const [key, value] of Object.entries(values)) {
				before[key] = this.repo.findValue(key, tx) ?? null;
				this.repo.save(key, value, this.ctx.userId, tx);
			}
			return { result: undefined, entityId: null, before, after: values };
		});
	}

	private requisites(): OrgRequisitesDto | null {
		const parsed = orgRequisitesSchema.safeParse(this.repo.findValue('org.requisites'));
		if (!parsed.success) return null;
		const { name, ...rest } = parsed.data;
		return { name, ...definedProps(rest) };
	}

	private numberingOf(now: Date, tx?: Tx): NumberingDto {
		const state = this.stateOf(tx);
		const preview = nextNumber(state, now, OrgService.timezone(this.repo)).number;
		return { key: 'request', prefix: state.prefix, period: state.period, nextPreview: preview };
	}

	private stateOf(tx?: Tx): SequenceState {
		const state = this.numbering.find('request', tx);
		if (!state) throw new Error('numbering sequence request is missing, run the seed');
		return state;
	}
}
