import { DebtRepository } from '../counterparty/debt.repository';
import type { Tx } from '../db/client';
import { StaffDtoMapper } from '../staff/dto';
import { StaffRepository } from '../staff/staff.repository';
import { CounterpartyBaseService } from './counterparty-base.service';
import { CounterpartyDetailRepository } from './counterparty-detail.repository';
import { CrmCounterpartyRepository } from './crm-counterparty.repository';
import { CrmCounterpartyDtoMapper } from './dto';
import type { ActorContext } from '$lib/types/actor';
import type {
	CrmCounterpartyCardDto,
	CrmCounterpartyChoicesDto,
	CrmCounterpartyFilters,
	CrmCounterpartyListItemDto
} from '$lib/types/crm-counterparty';
import type { ListQuery, Page } from '$lib/types/list';
import type { RequisitesInput, TermsInput } from '$lib/validation/crm-counterparty';

/** Registry and card of the counterparties for the workshop (tech.md 14, C3). */
export class CrmCounterpartyService extends CounterpartyBaseService {
	constructor(
		ctx: ActorContext,
		counterparties: CrmCounterpartyRepository = new CrmCounterpartyRepository(),
		private readonly details: CounterpartyDetailRepository = new CounterpartyDetailRepository(),
		private readonly staff: StaffRepository = new StaffRepository(),
		private readonly debts: DebtRepository = new DebtRepository()
	) {
		super(ctx, counterparties);
	}

	list(query: ListQuery<CrmCounterpartyFilters>): Page<CrmCounterpartyListItemDto> {
		const { rows, total } = this.counterparties.list(query, () => this.debts.debtorsWhere());
		// Debt is money: a price-blind role never triggers the query.
		const debts = this.ctx.canSeePrices
			? this.debts.byCounterparty(rows.map((row) => row.id))
			: undefined;
		return {
			rows: rows.map((row) =>
				CrmCounterpartyDtoMapper.toListItem(
					row,
					debts && (debts.get(row.id) ?? { debtMinor: 0, openCount: 0 })
				)
			),
			total,
			page: query.page,
			perPage: query.perPage
		};
	}

	/** @throws NotFoundError for an unknown or removed counterparty. */
	card(id: number, tx?: Tx): CrmCounterpartyCardDto {
		const row = this.requireCounterparty(id, tx);
		return CrmCounterpartyDtoMapper.toCard(row, {
			contracts: this.details.contracts(id, tx),
			addresses: this.details.addresses(id, tx),
			users: this.staff.listOf(id, tx).map((member) => StaffDtoMapper.toMember(member, this.ctx)),
			debt: this.ctx.canSeePrices ? this.debts.of(id, tx) : undefined
		});
	}

	choices(): CrmCounterpartyChoicesDto {
		return this.counterparties.choices();
	}

	/** Names, requisites and contacts. The journal keeps which fields moved, not their values. */
	updateRequisites(id: number, input: RequisitesInput): CrmCounterpartyCardDto {
		return this.audited({ action: 'counterparty.update', entity: 'counterparties' }, (tx) => {
			const old = this.requireCounterparty(id, tx);
			this.counterparties.update(id, input, tx);
			const fields = (Object.keys(input) as (keyof RequisitesInput)[]).filter(
				(key) => old[key] !== input[key]
			);
			return { result: this.card(id, tx), entityId: id, after: { fields } };
		});
	}

	/** Price list, discount, settlement scheme, manager and seats: the commercial terms. */
	updateTerms(id: number, input: TermsInput): CrmCounterpartyCardDto {
		return this.audited({ action: 'counterparty.terms_update', entity: 'counterparties' }, (tx) => {
			const old = this.requireCounterparty(id, tx);
			this.validateTerms(input, tx);
			this.counterparties.update(id, input, tx);
			return {
				result: this.card(id, tx),
				entityId: id,
				before: {
					priceListId: old.priceListId,
					discountPercent: old.discountPercent,
					settlementScheme: old.settlementScheme,
					managerId: old.managerId,
					staffLimit: old.staffLimit
				},
				after: { ...input }
			};
		});
	}

	/** Free text about people may sit in the notes, so the journal only records that they changed. */
	updateNotes(id: number, notes: string | null): CrmCounterpartyCardDto {
		return this.audited({ action: 'counterparty.notes_update', entity: 'counterparties' }, (tx) => {
			this.requireCounterparty(id, tx);
			this.counterparties.update(id, { notes }, tx);
			return { result: this.card(id, tx), entityId: id, after: { hasNotes: notes !== null } };
		});
	}
}
