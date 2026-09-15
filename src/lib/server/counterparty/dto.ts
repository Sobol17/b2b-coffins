import type {
	ContactRow,
	ContractRow,
	CounterpartyRow,
	MoneyTotalsRow
} from './counterparty.repository';
import type {
	ContactDto,
	CounterpartyCardDto,
	PortalRole,
	StaffPreviewDto
} from '$lib/types/counterparty';
import type { RoleCode } from '$lib/types/roles';
import { definedProps } from '$lib/utils/props';

export interface CardParts {
	readonly contract: ContractRow | undefined;
	readonly manager: ContactRow | undefined;
	readonly staff: { rows: readonly (ContactRow & { role: RoleCode })[]; total: number };
	/** Undefined for a role without prices: the figures were never read. */
	readonly money: MoneyTotalsRow | undefined;
}

export function asPortalRole(role: RoleCode): PortalRole {
	if (role === 'cp_admin' || role === 'cp_employee') return role;
	throw new Error(`portal account holds a non-portal role: ${role}`);
}

export class CounterpartyDtoMapper {
	static toContact(row: ContactRow): ContactDto {
		return { fullName: row.fullName, phone: row.phone, email: row.email };
	}

	static toCard(row: CounterpartyRow, parts: CardParts): CounterpartyCardDto {
		return {
			id: row.id,
			name: row.name,
			legalName: row.legalName,
			inn: row.inn,
			kpp: row.kpp,
			address: row.address,
			phone: row.phone,
			email: row.email,
			settlementScheme: row.settlementScheme,
			contract: parts.contract
				? {
						number: parts.contract.number,
						signedAt: parts.contract.signedAt?.toISOString() ?? null,
						validUntil: parts.contract.validUntil?.toISOString() ?? null
					}
				: null,
			manager: parts.manager ? CounterpartyDtoMapper.toContact(parts.manager) : null,
			staffPreview: parts.staff.rows.map((member): StaffPreviewDto => ({
				...CounterpartyDtoMapper.toContact(member),
				role: asPortalRole(member.role)
			})),
			staffCount: parts.staff.total,
			staffLimit: row.staffLimit,
			...definedProps({
				discountPercent: parts.money === undefined ? undefined : row.discountPercent,
				debtMinor: parts.money?.debtMinor,
				yearPurchasesMinor: parts.money?.yearPurchasesMinor,
				yearDeliveries: parts.money?.yearDeliveries
			})
		};
	}
}
