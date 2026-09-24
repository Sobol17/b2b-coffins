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
	readonly priceListId: number | null;
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
