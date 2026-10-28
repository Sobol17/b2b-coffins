import type {
	ContractDto,
	CreatedStaffDto,
	SettlementScheme,
	StaffMemberDto
} from './counterparty';
import type { DeliveryAddressDto } from './request';

/** Counterparty card of the workshop, tech.md §8 (C3). Money keys only for a role with prices. */
export const PAYMENT_METHODS = ['cash', 'bank', 'card', 'offset'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export interface CrmCounterpartyFilters {
	readonly managerId?: number | undefined;
	readonly scheme?: SettlementScheme | undefined;
	readonly hasDebt?: boolean | undefined;
}

export interface CrmCounterpartyListItemDto {
	readonly id: number;
	readonly name: string;
	readonly inn: string | null;
	readonly managerName: string | null;
	readonly settlementScheme: SettlementScheme;
	readonly staffCount: number;
	readonly isActive: boolean;
	readonly debtMinor?: number;
}

/** Debt of a request: max(0, total minus its payment marks), for delivered and awaiting payment. */
export interface CrmCounterpartyDebtDto {
	readonly debtMinor: number;
	readonly openCount: number;
}

export interface CrmContractDto extends ContractDto {
	readonly id: number;
}

export interface CrmDeliveryAddressDto extends DeliveryAddressDto {
	readonly contactName: string | null;
	readonly contactPhone: string | null;
}

export interface CrmCounterpartyCardDto {
	readonly id: number;
	readonly name: string;
	readonly legalName: string | null;
	readonly inn: string | null;
	readonly kpp: string | null;
	readonly address: string | null;
	readonly phone: string | null;
	readonly email: string | null;
	/** The regional list the personal prices were prefilled from (v1.64). */
	readonly regionPriceListId: number | null;
	readonly discountPercent: number;
	readonly settlementScheme: SettlementScheme;
	readonly managerId: number | null;
	readonly staffLimit: number;
	readonly notes: string | null;
	readonly isActive: boolean;
	readonly contracts: readonly CrmContractDto[];
	readonly addresses: readonly CrmDeliveryAddressDto[];
	/** `isSelf` is always false: a workshop actor has no portal account. */
	readonly users: readonly StaffMemberDto[];
	readonly debt?: CrmCounterpartyDebtDto;
}

export interface CrmPaymentMarkDto {
	readonly id: number;
	readonly requestId: number;
	readonly requestNumber: string;
	readonly amountMinor: number;
	readonly paidAt: string;
	readonly method: PaymentMethod;
	readonly comment: string | null;
	/** Set on a row that cancels an earlier mark; it carries the negated amount (tech.md v1.44). */
	readonly reversalOfId: number | null;
	/** A later row cancelled this mark. */
	readonly isReversed: boolean;
	readonly createdByName: string;
}

export interface CrmCounterpartyChoicesDto {
	readonly managers: readonly { readonly id: number; readonly fullName: string }[];
	readonly priceLists: readonly { readonly id: number; readonly title: string }[];
}

export interface CreatedCounterpartyDto {
	readonly counterpartyId: number;
	readonly access: CreatedStaffDto;
}

/** Filters of the «Цены» tab of a counterparty card (v1.56). */
export interface CounterpartyPriceFilters {
	readonly search?: string | undefined;
	readonly categoryId?: number | undefined;
}

/** One variant on the «Цены» tab (v1.56). The tab exists only for a role with prices. */
export interface CounterpartyPriceRowDto {
	readonly variantId: number;
	readonly productTitle: string;
	readonly categoryTitle: string | null;
	readonly sku: string;
	readonly sizeCode: string;
	/** What the counterparty pays without its own price: the base list, then the variant price. */
	readonly basePriceMinor: number;
	/** The counterparty's own price, null while it pays the base one. */
	readonly personalPriceMinor: number | null;
}

export interface CounterpartyPriceSaveResult {
	readonly updated: number;
	readonly cleared: number;
}
