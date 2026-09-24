import { PolicyService } from '../auth/policy';
import { ConflictError, NotFoundError, ValidationError } from '../core/errors';
import { BaseService } from '../core/service';
import type { Tx } from '../db/client';
import { OrgService } from '../settings/org.service';
import { startOfDayInZone } from '$lib/domain/time/zone';
import type { ActorContext } from '$lib/types/actor';
import type { CrmDiscountRuleDto, CrmPriceListDto } from '$lib/types/crm-catalog';
import {
	discountRuleInputSchema,
	priceListInputSchema,
	type DiscountRuleInput,
	type PriceListInput,
	type PriceListItemInput
} from '$lib/validation/crm-catalog';
import { DiscountRuleRepository, type ManagedDiscountRuleRow } from './discount-rule.repository';
import { ManagedPriceListRepository, type ManagedPriceListRow } from './price-list.repository';

type Window = { readonly validFrom: Date | null; readonly validTo: Date | null };

/** Prices and discounts are workshop-managed; agency prices remain with the counterparty. */
export class CrmPricingService extends BaseService {
	constructor(
		ctx: ActorContext,
		private readonly lists: ManagedPriceListRepository = new ManagedPriceListRepository(),
		private readonly rules: DiscountRuleRepository = new DiscountRuleRepository()
	) {
		super(ctx);
		this.assert(ctx.scope === 'crm' && PolicyService.can(ctx, 'catalog.manage'), 'catalog.manage');
	}

	listPriceLists(): CrmPriceListDto[] {
		return this.lists.list().map((row) => this.listDto(row));
	}

	getPriceList(id: number): CrmPriceListDto {
		return this.listDto(this.requireList(id));
	}

	createPriceList(input: PriceListInput): CrmPriceListDto {
		return this.audited({ action: 'price_list.create', entity: 'price_lists' }, (tx) => {
			const row = this.listRow(input);
			this.checkBaseWindow(row, undefined, tx);
			const id = this.lists.insert(row, tx);
			return {
				result: this.listDto(this.requireList(id, tx), tx),
				entityId: id,
				after: { title: input.title, isBase: input.isBase }
			};
		});
	}

	updatePriceList(id: number, input: PriceListInput): CrmPriceListDto {
		return this.audited({ action: 'price_list.update', entity: 'price_lists' }, (tx) => {
			const old = this.requireList(id, tx);
			const row = this.listRow(input);
			this.checkBaseWindow(row, id, tx);
			this.lists.update(id, row, tx);
			return {
				result: this.listDto(this.requireList(id, tx), tx),
				entityId: id,
				before: { title: old.title, isBase: old.isBase },
				after: { title: input.title, isBase: input.isBase }
			};
		});
	}

	deletePriceList(id: number): void {
		this.audited({ action: 'price_list.delete', entity: 'price_lists' }, (tx) => {
			const old = this.requireList(id, tx);
			if (this.lists.assigned(id, tx)) throw new ConflictError('Прайс-лист назначен контрагенту');
			this.lists.delete(id, tx);
			return {
				result: undefined,
				entityId: id,
				before: { title: old.title },
				after: { deleted: true }
			};
		});
	}

	upsertPriceItem(input: PriceListItemInput): CrmPriceListDto {
		return this.audited({ action: 'price_list.item.upsert', entity: 'price_list_items' }, (tx) => {
			this.requireList(input.priceListId, tx);
			if (!this.lists.variantAvailable(input.variantId, tx))
				throw new ValidationError('Вариант не найден');
			this.lists.upsertItem(input.priceListId, input.variantId, input.priceMinor, tx);
			return {
				result: this.listDto(this.requireList(input.priceListId, tx), tx),
				entityId: input.priceListId,
				after: { variantId: input.variantId, priceMinor: input.priceMinor }
			};
		});
	}

	deletePriceItem(priceListId: number, variantId: number): CrmPriceListDto {
		return this.audited({ action: 'price_list.item.delete', entity: 'price_list_items' }, (tx) => {
			this.requireList(priceListId, tx);
			this.lists.deleteItem(priceListId, variantId, tx);
			return {
				result: this.listDto(this.requireList(priceListId, tx), tx),
				entityId: priceListId,
				before: { variantId },
				after: { removed: true }
			};
		});
	}

	listDiscountRules(): CrmDiscountRuleDto[] {
		return this.rules.list().map((row) => this.ruleDto(row));
	}

	createDiscountRule(input: DiscountRuleInput): CrmDiscountRuleDto {
		return this.audited({ action: 'discount_rule.create', entity: 'discount_rules' }, (tx) => {
			this.validateRule(input, tx);
			const id = this.rules.insert({ ...input, ...this.window(input) }, tx);
			return {
				result: this.ruleDto(this.requireRule(id, tx)),
				entityId: id,
				after: {
					counterpartyId: input.counterpartyId,
					categoryId: input.categoryId,
					percent: input.percent
				}
			};
		});
	}

	updateDiscountRule(id: number, input: DiscountRuleInput): CrmDiscountRuleDto {
		return this.audited({ action: 'discount_rule.update', entity: 'discount_rules' }, (tx) => {
			const old = this.requireRule(id, tx);
			this.validateRule(input, tx);
			this.rules.update(id, { ...input, ...this.window(input) }, tx);
			return {
				result: this.ruleDto(this.requireRule(id, tx)),
				entityId: id,
				before: { percent: old.percent },
				after: { percent: input.percent }
			};
		});
	}

	deleteDiscountRule(id: number): void {
		this.audited({ action: 'discount_rule.delete', entity: 'discount_rules' }, (tx) => {
			const old = this.requireRule(id, tx);
			this.rules.delete(id, tx);
			return {
				result: undefined,
				entityId: id,
				before: { percent: old.percent },
				after: { deleted: true }
			};
		});
	}

	private listRow(input: PriceListInput): Omit<ManagedPriceListRow, 'id'> {
		if (!priceListInputSchema.safeParse(input).success)
			throw new ValidationError('Проверьте период прайс-листа');
		return { title: input.title, isBase: input.isBase, ...this.window(input) };
	}

	private window(input: { validFrom: string | null; validTo: string | null }): Window {
		const zone = OrgService.timezone();
		const validFrom = input.validFrom === null ? null : startOfDayInZone(input.validFrom, zone);
		const validTo = input.validTo === null ? null : startOfDayInZone(input.validTo, zone);
		if (
			(input.validFrom !== null && validFrom === null) ||
			(input.validTo !== null && validTo === null) ||
			(validFrom !== null && validTo !== null && validFrom >= validTo)
		)
			throw new ValidationError('Проверьте период действия');
		return { validFrom, validTo };
	}

	private checkBaseWindow(
		row: Omit<ManagedPriceListRow, 'id'>,
		exceptId: number | undefined,
		tx: Tx
	): void {
		if (!row.isBase) return;
		const overlaps = this.lists
			.baseExcept(exceptId, tx)
			.some(
				(other) =>
					(row.validFrom?.getTime() ?? -Infinity) < (other.validTo?.getTime() ?? Infinity) &&
					(other.validFrom?.getTime() ?? -Infinity) < (row.validTo?.getTime() ?? Infinity)
			);
		if (overlaps) throw new ValidationError('Период пересекается с другим базовым прайс-листом');
	}

	private validateRule(input: DiscountRuleInput, tx: Tx): void {
		if (!discountRuleInputSchema.safeParse(input).success)
			throw new ValidationError('Проверьте правило скидки');
		if (input.counterpartyId !== null && !this.rules.counterpartyExists(input.counterpartyId, tx))
			throw new ValidationError('Контрагент не найден');
		if (input.categoryId !== null && !this.rules.categoryExists(input.categoryId, tx))
			throw new ValidationError('Категория не найдена');
	}

	private requireList(id: number, tx?: Tx): ManagedPriceListRow {
		const row = this.lists.find(id, tx);
		if (!row) throw new NotFoundError('price list');
		return row;
	}

	private requireRule(id: number, tx?: Tx): ManagedDiscountRuleRow {
		const row = this.rules.find(id, tx);
		if (!row) throw new NotFoundError('discount rule');
		return row;
	}

	private listDto(row: ManagedPriceListRow, tx?: Tx): CrmPriceListDto {
		return {
			id: row.id,
			title: row.title,
			isBase: row.isBase,
			validFrom: this.dayText(row.validFrom),
			validTo: this.dayText(row.validTo),
			items: this.lists.items(row.id, tx)
		};
	}

	private ruleDto(row: ManagedDiscountRuleRow): CrmDiscountRuleDto {
		return {
			id: row.id,
			counterpartyId: row.counterpartyId,
			categoryId: row.categoryId,
			percent: row.percent,
			validFrom: this.dayText(row.validFrom),
			validTo: this.dayText(row.validTo)
		};
	}

	private dayText(date: Date | null): string | null {
		return date?.toLocaleDateString('en-CA', { timeZone: OrgService.timezone() }) ?? null;
	}
}
