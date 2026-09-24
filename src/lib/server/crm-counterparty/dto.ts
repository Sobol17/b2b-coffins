import type { Debt } from '$lib/domain/payment/debt';
import type { StaffMemberDto } from '$lib/types/counterparty';
import type {
	CrmContractDto,
	CrmCounterpartyCardDto,
	CrmCounterpartyListItemDto,
	CrmDeliveryAddressDto,
	CrmPaymentMarkDto
} from '$lib/types/crm-counterparty';
import { definedProps } from '$lib/utils/props';
import type { AddressRecord, ContractRecord } from './counterparty-detail.repository';
import type { PaymentMarkRow } from './counterparty-ledger.repository';
import type { CounterpartyListRow, ManagedCounterpartyRow } from './crm-counterparty.repository';

export interface CardParts {
	readonly contracts: readonly ContractRecord[];
	readonly addresses: readonly AddressRecord[];
	readonly users: readonly StaffMemberDto[];
	/** Undefined for a role without prices: the debt was never read. */
	readonly debt: Debt | undefined;
}

/** Role projection of the counterparty card (tech.md 8.1): money keys only when they were read. */
export class CrmCounterpartyDtoMapper {
	static toListItem(row: CounterpartyListRow, debt: Debt | undefined): CrmCounterpartyListItemDto {
		return { ...row, ...definedProps({ debtMinor: debt?.debtMinor }) };
	}

	static toCard(row: ManagedCounterpartyRow, parts: CardParts): CrmCounterpartyCardDto {
		return {
			id: row.id,
			name: row.name,
			legalName: row.legalName,
			inn: row.inn,
			kpp: row.kpp,
			address: row.address,
			phone: row.phone,
			email: row.email,
			priceListId: row.priceListId,
			discountPercent: row.discountPercent,
			settlementScheme: row.settlementScheme,
			managerId: row.managerId,
			staffLimit: row.staffLimit,
			notes: row.notes,
			isActive: row.isActive,
			contracts: parts.contracts.map(CrmCounterpartyDtoMapper.toContract),
			addresses: parts.addresses.map((address): CrmDeliveryAddressDto => ({ ...address })),
			users: parts.users,
			...definedProps({ debt: parts.debt && { ...parts.debt } })
		};
	}

	static toContract(row: ContractRecord): CrmContractDto {
		return {
			id: row.id,
			number: row.number,
			signedAt: row.signedAt?.toISOString() ?? null,
			validUntil: row.validUntil?.toISOString() ?? null
		};
	}

	static toPayment(row: PaymentMarkRow): CrmPaymentMarkDto {
		return { ...row, paidAt: row.paidAt.toISOString() };
	}
}
